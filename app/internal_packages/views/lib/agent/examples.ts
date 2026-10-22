import DOMPurify from 'dompurify';
import {
  Actions,
  DatabaseStore,
  Message,
  QuotedHTMLTransformer,
  SanitizeTransformer,
} from 'mailspring-exports';
import { bodyText } from '../bridge/content';
import { Example, ExampleChip } from './types';

/**
 * Builds the examples a user hands to the authoring agent. These leave the device, so the
 * payload is limited to what the panel's chip implies: headers, the message's own text, and
 * its HTML with nothing that would load or phone home when the agent looks at it.
 */

const MAX_TEXT_CHARS = 20000;
const MAX_HTML_CHARS = 150000;
const BODY_FETCH_TIMEOUT_MS = 10000;
const BODY_POLL_INTERVAL_MS = 500;

// A second pass over SanitizeTransformer's output (which already drops scripts, frames, SVG,
// <link> and <meta>) for everything else that loads content or submits data. Images
// go too: every remote image in mail is either content the agent can't use or a tracking
// pixel, and cid: images are attachments the user didn't choose to share. A private instance
// keeps these hooks off the shared DOMPurify that renders mail.
const purifier = DOMPurify(window);
const noURLs = (css: string) => css.replace(/url\(\s*(['"]?)[^'")]*\1\s*\)/gi, 'none');

// What can still load after noURLs: a url() it couldn't parse, image-set() and image(), which
// take plain strings, src(), imports and fonts. A backslash can spell any of these as a CSS
// escape (`\75 rl(`), so it counts too.
const CSS_LOADS = /url\(|image-set\(|\bimage\(|\bsrc\(|@import|@font-face|\\/i;

/** The CSS with its url()s and imports removed, or '' when anything else in it could load. */
function safeCSS(css: string) {
  const out = noURLs(css).replace(/@import[^;]*;?/gi, '');
  return CSS_LOADS.test(out) ? '' : out;
}

purifier.addHook('uponSanitizeElement', (node, { tagName }) => {
  const el = node as Element;
  if (tagName === 'img') {
    const alt = (el.getAttribute('alt') || '').trim();
    if (alt) el.parentNode?.insertBefore(el.ownerDocument.createTextNode(alt), el);
  } else if (tagName === 'style') {
    el.textContent = safeCSS(el.textContent || '');
  }
});
purifier.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'style') {
    data.attrValue = safeCSS(data.attrValue);
    if (!data.attrValue) data.keepAttr = false;
  } else if (data.attrName !== 'href') {
    data.attrValue = noURLs(data.attrValue);
  }
});

function stripLoadingContent(html: string) {
  return purifier.sanitize(html, {
    FORBID_TAGS: [
      'img',
      'picture',
      'source',
      'video',
      'audio',
      'track',
      'image',
      'feImage',
      'form',
    ],
    FORBID_ATTR: ['src', 'srcset', 'background', 'poster', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
    // SanitizeTransformer's output can open with a <style> that would otherwise parse into
    // <head> and be dropped.
    FORCE_BODY: true,
  });
}

const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n[truncated]` : s);

const contacts = (list: { name?: string; email: string }[] = []) =>
  list.map((c) => ({ name: c.name || '', email: c.email }));

/** The example for one message. `message.body` must be loaded (null bodies send empty text). */
export function buildExample(message: Message): Example {
  const body = message.body;
  let text = '';
  let html = '';
  if (body) {
    text = bodyText(body, { plaintext: message.plaintext, includeQuoted: false });
    if (!message.plaintext) {
      const unquoted = QuotedHTMLTransformer.removeQuotedHTML(body, {
        keepIfWholeBodyIsQuote: true,
      });
      html = stripLoadingContent(SanitizeTransformer.runSync(unquoted));
    }
  }
  return {
    messageId: message.id,
    threadId: message.threadId,
    from: contacts(message.from),
    to: contacts(message.to),
    cc: contacts(message.cc),
    subject: message.subject || '',
    date: new Date(message.date).toISOString(),
    text: cap(text, MAX_TEXT_CHARS),
    html: cap(html, MAX_HTML_CHARS),
  };
}

export function chipFor(example: Example): ExampleChip {
  const sender = example.from[0];
  return {
    messageId: example.messageId,
    threadId: example.threadId,
    subject: example.subject,
    from: sender ? sender.name || sender.email : '',
    date: example.date,
    snippet: example.text.replace(/\s+/g, ' ').trim().slice(0, 140),
    bytes: Buffer.byteLength(JSON.stringify(example), 'utf8'),
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function latestMessages(threadIds: string[]) {
  const messages = await DatabaseStore.findAll<Message>(Message)
    .where(Message.attributes.threadId.in(threadIds))
    .where(Message.attributes.draft.equal(false))
    .include(Message.attributes.body);
  const latest = new Map<string, Message>();
  for (const m of messages) {
    const current = latest.get(m.threadId);
    if (!current || new Date(m.date) > new Date(current.date)) latest.set(m.threadId, m);
  }
  return threadIds.map((id) => latest.get(id)).filter(Boolean);
}

/**
 * The newest message of each thread as an example, fetching bodies the sync engine hasn't
 * downloaded yet (waiting briefly; a body still missing after that is sent as empty text).
 */
export async function examplesForThreads(threadIds: string[]): Promise<Example[]> {
  let messages = await latestMessages(threadIds);
  const missing = messages.filter((m) => m.body === null);
  if (missing.length) {
    Actions.fetchBodies(missing);
    const deadline = Date.now() + BODY_FETCH_TIMEOUT_MS;
    while (Date.now() < deadline && messages.some((m) => m.body === null)) {
      await delay(BODY_POLL_INTERVAL_MS);
      messages = await latestMessages(threadIds);
    }
  }
  return messages.map(buildExample);
}
