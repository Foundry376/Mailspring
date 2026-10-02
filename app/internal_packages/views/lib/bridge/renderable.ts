import fs from 'fs';
import { ipcRenderer } from 'electron';
import {
  AttachmentStore,
  DatabaseStore,
  File,
  Message,
  MessageBodyProcessor,
  QuotedHTMLTransformer,
} from 'mailspring-exports';
import { isMessageAllowed } from '../../../mcp-server/lib/capabilities/grant';
import EmailFrameStylesStore from '../../../message-list/lib/email-frame-styles-store';
import { ViewError } from './errors';
import type { ViewGrant } from './grant';

// Must match REGISTER_RESOURCES_CHANNEL in app/src/browser/view-sessions.ts.
const REGISTER_RESOURCES_CHANNEL = 'mailspring-view:register-resources';

type ResourceRequest =
  | { kind: 'file'; filePath: string; contentType: string | null }
  | { kind: 'remote'; url: string };

// Elements that could load content or change how the document behaves. The frame a View
// renders into has no scripts and the View's CSP blocks other origins, so this is cleanup of
// things that would only fail noisily, not the security boundary.
const REMOVED_SELECTOR =
  'script, iframe, frame, frameset, object, embed, applet, link, base, meta, form, portal';

function escapeHTML(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Turns a processed message body into a document whose images all point at host-served
 * `mailspring-view://<viewId>/_res/<token>` URLs: `cid:` references become the inline
 * attachment's file and http(s) images go through the host's image proxy. Images the user's
 * remote-image policy blocked were already replaced with `#` by MessageBodyProcessor.
 */
async function rewriteResources(viewId: string, message: Message, html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(REMOVED_SELECTOR).forEach((el) => el.remove());

  const requests: ResourceRequest[] = [];
  const apply: ((url: string | null) => void)[] = [];

  const request = (raw: string, set: (url: string | null) => void) => {
    const value = (raw || '').trim();
    if (/^data:image\//i.test(value)) return;
    if (/^cid:/i.test(value)) {
      const cid = value.slice(4).replace(/^<|>$/g, '');
      const file = (message.files || []).find((f: File) => f.contentId === cid);
      const filePath = file && AttachmentStore.pathForFile(file);
      if (filePath && fs.existsSync(filePath)) {
        requests.push({ kind: 'file', filePath, contentType: file.contentType || null });
        apply.push(set);
        return;
      }
    } else if (/^https?:\/\//i.test(value)) {
      requests.push({ kind: 'remote', url: value });
      apply.push(set);
      return;
    }
    set(null);
  };

  for (const el of Array.from(doc.querySelectorAll('[srcset]'))) el.removeAttribute('srcset');
  for (const el of Array.from(doc.querySelectorAll('img[src], input[src], video[poster]'))) {
    const attr = el.hasAttribute('poster') ? 'poster' : 'src';
    request(el.getAttribute(attr), (url) =>
      url ? el.setAttribute(attr, url) : el.removeAttribute(attr)
    );
  }
  for (const el of Array.from(doc.querySelectorAll('[background]'))) {
    request(el.getAttribute('background'), (url) =>
      url ? el.setAttribute('background', url) : el.removeAttribute('background')
    );
  }

  // CSS url() in style attributes and <style> blocks: background images in newsletters. Each
  // url() is resolved like an attribute, then the declaration is reassembled once all are.
  const finalizers: (() => void)[] = [];
  const rewriteCSS = (css: string, set: (next: string) => void) => {
    const parts: string[] = [];
    const urlRegexp = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRegexp.exec(css))) {
      parts.push(css.slice(last, match.index));
      const index = parts.push(match[0]) - 1;
      request(match[2], (url) => {
        parts[index] = url ? `url("${url}")` : 'none';
      });
      last = match.index + match[0].length;
    }
    if (last === 0) return;
    parts.push(css.slice(last));
    finalizers.push(() => set(parts.join('')));
  };
  for (const el of Array.from(doc.querySelectorAll('[style]'))) {
    rewriteCSS(el.getAttribute('style'), (next) => el.setAttribute('style', next));
  }
  for (const el of Array.from(doc.querySelectorAll('style'))) {
    rewriteCSS(el.textContent, (next) => (el.textContent = next));
  }

  const tokens: (string | null)[] = requests.length
    ? await ipcRenderer.invoke(REGISTER_RESOURCES_CHANNEL, viewId, requests)
    : [];
  apply.forEach((set, idx) =>
    set(tokens[idx] ? `mailspring-view://${viewId}/_res/${tokens[idx]}` : null)
  );
  finalizers.forEach((finalize) => finalize());
  return doc.body.innerHTML;
}

/**
 * The standard message frame's document for one message: the body as the reading pane
 * shows it (sanitized, MessageViewExtensions applied, remote images per the user's policy,
 * quoted text collapsed) wrapped in the theme's email-frame styles.
 */
export async function renderableFor(
  grant: ViewGrant,
  message: Message,
  { includeQuoted = false }: { includeQuoted?: boolean } = {}
) {
  if (!isMessageAllowed(grant.scope, message)) {
    throw new ViewError('not_found', `No message with id ${message.id}.`);
  }
  if (message.body === null) {
    return { html: null, plaintext: !!message.plaintext };
  }
  const { body } = await MessageBodyProcessor.retrieve(message);
  const { themeStyles, renderModeStyles } = EmailFrameStylesStore.styles();
  const head =
    `<!DOCTYPE html><meta charset="utf-8">` +
    `<style>${themeStyles || ''}</style>` +
    `<style data-email-render-mode>${renderModeStyles || ''}</style>` +
    // Inline frames are sized to their content by the View, so they never scroll.
    `<style>html, body { overflow: hidden !important; }</style>`;

  if (message.plaintext) {
    return {
      html: `${head}<div id="inbox-plain-wrapper" class="${process.platform}" style="white-space: pre-wrap">${escapeHTML(body)}</div>`,
      plaintext: true,
    };
  }
  const content = includeQuoted
    ? body
    : QuotedHTMLTransformer.removeQuotedHTML(body, { keepIfWholeBodyIsQuote: true });
  const rewritten = await rewriteResources(grant.viewId, message, content);
  return {
    html: `${head}<div id="inbox-html-wrapper" class="${process.platform}">${rewritten}</div>`,
    plaintext: false,
  };
}

/** A host-served URL for one attachment's bytes, if the sync engine has downloaded it. */
export async function attachmentURLFor(grant: ViewGrant, fileId: string) {
  const file = await DatabaseStore.find<File>(File, fileId);
  const message = file && (await DatabaseStore.find<Message>(Message, file.messageId));
  if (!file || !message || !isMessageAllowed(grant.scope, message)) {
    throw new ViewError('not_found', `No attachment with id ${fileId}.`);
  }
  const filePath = AttachmentStore.pathForFile(file);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new ViewError('unavailable', 'This attachment has not been downloaded yet.');
  }
  const [token] = await ipcRenderer.invoke(REGISTER_RESOURCES_CHANNEL, grant.viewId, [
    { kind: 'file', filePath, contentType: file.contentType || null },
  ]);
  if (!token) throw new ViewError('not_found', `No attachment with id ${fileId}.`);
  return `mailspring-view://${grant.viewId}/_res/${token}`;
}
