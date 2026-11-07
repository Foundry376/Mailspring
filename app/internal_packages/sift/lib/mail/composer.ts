import { DraftStore, Utils } from 'mailspring-exports';
import type { DraftEditingSession } from 'mailspring-exports';
import { streamDraft, textToComposerHtml, type DraftRequest } from '../ai/draft';

// The composer keeps the signature and quoted reply below the user's text.
// AI output goes above the first of these, the same way composer-templates
// inserts templates.
const TAIL_MARKERS = [
  '<signature',
  '<div class="gmail_quote_attribution"',
  '<blockquote class="gmail_quote"',
];

export function splitDraftBody(body: string): { head: string; tail: string } {
  const positions = TAIL_MARKERS.map((m) => body.indexOf(m)).filter((i) => i >= 0);
  const cut = positions.length ? Math.min(...positions) : body.length;
  return { head: body.slice(0, cut), tail: body.slice(cut) };
}

export function draftPlainText(session: DraftEditingSession): string {
  const { head } = splitDraftBody(session.draft().body || '');
  return Utils.extractTextFromHtml(head.replace(/<(br|\/div|\/p)[^>]*>/gi, '$&\n')).trim();
}

/**
 * Generate text with the model and stream it into a draft, replacing what the
 * user wrote above the signature/quote. Edits are throttled so the editor
 * isn't swapped on every token.
 */
export async function generateIntoSession(
  session: DraftEditingSession,
  req: Omit<DraftRequest, 'currentText' | 'subject' | 'recipients'>,
  { signal }: { signal?: AbortSignal } = {}
): Promise<void> {
  await session.prepare?.();
  const draft = session.draft();
  const { tail } = splitDraftBody(draft.body || '');
  const currentText = draftPlainText(session);
  const recipients = (draft.to || []).map((c: any) => c.name || c.email).join(', ');

  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const apply = (text: string) => {
    session.changes.add({ body: `${textToComposerHtml(text)}${tail}` });
  };
  const flush = () => {
    timer = null;
    if (pending !== null) apply(pending);
    pending = null;
  };

  const final = await streamDraft(
    {
      ...req,
      currentText,
      subject: draft.subject,
      recipients,
      threadId: req.threadId ?? draft.threadId ?? null,
    },
    (soFar) => {
      pending = soFar;
      if (!timer) timer = setTimeout(flush, 200);
    },
    signal
  );
  if (timer) clearTimeout(timer);
  apply(final);
  session.changes.commit();
}

/** Open (or reuse) an inline reply to the thread's last message and fill it with AI text. */
export async function replyWithAI(
  thread: any,
  messages: any[],
  instruction: string,
  signal?: AbortSignal
) {
  // Reuse a reply that's already open: composing a new reply when one exists
  // gives the draft a fresh editing session that the open composer isn't
  // bound to, so the text would land in the wrong place.
  const existing = messages.filter((m) => m.draft).pop();
  let headerMessageId = existing?.headerMessageId;
  if (!headerMessageId) {
    const last = [...messages].reverse().find((m) => !m.draft);
    const result = await DraftStore._onComposeReply({
      thread,
      message: last,
      type: 'reply',
      behavior: 'prefer-existing',
    });
    headerMessageId = result?.headerMessageId;
  }
  if (!headerMessageId) throw new Error('Could not open a reply draft.');
  const session = await DraftStore.sessionForClientId(headerMessageId);
  await generateIntoSession(
    session,
    { mode: 'reply', instruction, threadId: thread.id },
    { signal }
  );
}
