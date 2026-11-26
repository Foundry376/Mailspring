import { getSettings } from '../settings';
import {
  loadThread,
  myIdentity,
  nowLine,
  threadToPrompt,
  UNTRUSTED_CONTENT_RULES,
} from '../mail/context';
import { completeStream } from './client';

export type DraftMode = 'reply' | 'compose' | 'rewrite';

export interface DraftRequest {
  mode: DraftMode;
  /** What the user wants: "say yes to Thursday", "make it shorter", ... */
  instruction: string;
  /** The thread being replied to, if any. */
  threadId?: string | null;
  /** What the user has typed so far (plain text). */
  currentText?: string;
  subject?: string;
  recipients?: string;
}

function systemPrompt() {
  const me = myIdentity();
  const { writingStyle, aboutMe } = getSettings();
  return `You write email on behalf of ${me.name} (${me.emails.join(', ')}) inside the Mailspring email client.${
    aboutMe ? `\nAbout ${me.name}: ${aboutMe}` : ''
  }${writingStyle ? `\nTheir writing style, in their words: ${writingStyle}` : ''}

Output only the body of the email, ready to send: no subject line, no preamble like "Here's a draft", no commentary, no markdown. Use plain paragraphs separated by blank lines. Start with a greeting only if one fits the thread. End with a short sign-off and the first name ${me.name.split(' ')[0]} unless the style says otherwise. Do not invent facts, dates, numbers or commitments that are not in the thread or the user's instruction; if something essential is unknown, leave a clear placeholder like [time].

${UNTRUSTED_CONTENT_RULES}`;
}

async function buildPrompt(req: DraftRequest): Promise<string> {
  const parts = [`Current time: ${nowLine()}`];
  if (req.threadId) {
    const loaded = await loadThread(req.threadId);
    if (loaded)
      parts.push(`The thread being replied to:\n${threadToPrompt(loaded.thread, loaded.messages)}`);
  }
  if (req.subject) parts.push(`Subject: ${req.subject}`);
  if (req.recipients) parts.push(`To: ${req.recipients}`);
  const current = (req.currentText || '').trim();
  if (req.mode === 'rewrite') {
    parts.push(`<current_draft>\n${current}\n</current_draft>`);
    parts.push(
      `Rewrite the current draft. Keep its meaning and any facts in it. Instruction: ${req.instruction}`
    );
  } else {
    if (current)
      parts.push(
        `<notes_from_user>\n${current}\n</notes_from_user>\nUse these notes as the content to express.`
      );
    const task = req.mode === 'reply' ? 'Write the reply.' : 'Write the email.';
    parts.push(
      `${task} ${req.instruction ? `Instruction from ${myIdentity().name}: ${req.instruction}` : ''}`.trim()
    );
  }
  return parts.join('\n\n');
}

/** Streams a draft, calling onText with the full text so far. Resolves to the final text. */
export async function streamDraft(
  req: DraftRequest,
  onText: (textSoFar: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let text = '';
  const result = await completeStream(
    {
      effort: 'low',
      max_tokens: 6000,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: await buildPrompt(req) },
      ],
    },
    {
      signal,
      onText: (delta) => {
        text += delta;
        onText(text);
      },
    }
  );
  return (result.message.content || text).trim();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text → the div-per-line HTML Mailspring's composer produces itself. */
export function textToComposerHtml(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>'))
    .join('');
}
