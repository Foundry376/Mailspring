/**
 * The one prompt shape every local model backend accepts: ChatML written as plain text, which
 * the downloadable Qwen model reads directly and the Apple backend splits back into
 * Instructions and a prompt (splitChatPrompt in app/src/browser/local-model-provider.ts).
 *
 * The markers stay plain text because on our extraction eval set that measured better than
 * encoding them as special tokens. The empty think block turns off Qwen3.5's reasoning mode.
 * Put the long, cuttable input (an email, a digest) last in `user`: the Apple backend trims
 * the end of the prompt to fit its context.
 */
export function chatPrompt(system: string, user: string) {
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

const CHAT_MARKERS = /<\|im_(start|end)\|>/gi;

/**
 * Makes text written by someone else (mail, or anything a View passes) safe to place inside a
 * prompt. Because the ChatML markers are plain text, an email containing `<|im_end|>` would end
 * the turn it sits in and could open a new system turn; text containing the closing tag of the
 * block it's fenced in (`fence: 'email'` strips `<email>` and `</email>`) would escape the fence.
 */
export function untrustedText(text: string | null | undefined, fence?: string) {
  let out = (text || '').replace(CHAT_MARKERS, '');
  if (fence) out = out.replace(new RegExp(`<\\s*/?\\s*${fence}\\s*>`, 'gi'), '');
  return out;
}

/**
 * Cleans free text from the model. Small models sometimes continue past the answer into
 * another chat turn, and output that hit the token limit ends mid-sentence; this keeps only
 * the answer's whole sentences. Returns null when nothing is left.
 */
export function cleanModelText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw.split('<|im_')[0].trim();
  if (!text) return null;
  const lastStop = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  if (lastStop > 0 && /[^"'”’)\]\s]/.test(text.slice(lastStop + 1))) {
    text = text.slice(0, lastStop + 1);
  }
  return text.replace(/\n{3,}/g, '\n\n');
}
