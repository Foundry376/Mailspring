import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import {
  Actions,
  DatabaseStore,
  Message,
  TaskQueue,
  GetMessageRFC2822Task,
} from 'mailspring-exports';

/**
 * Generate a safe default .eml filename from a message subject.
 *
 * This is only used for save-dialog defaults and temp filenames on the client.
 * The backend (GetManyRFC2822Task) owns the more complex indexed filename
 * format used during bulk folder export.
 */
export function defaultEmlFilename(subject: string): string {
  let name = (subject || '').trim();
  if (name.length === 0) {
    name = 'untitled';
  }
  if (name.length > 80) {
    name = name.substring(0, 80);
  }
  name = name.replace(/[/?<>\\:*|"]/g, '_');
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, '');
  name = name.replace(/[.\s]+$/, '');
  return `${name}.eml`;
}

export interface StagedEml {
  message: Message;
  filePath: string;
}

/**
 * Resolve the message that represents each of the given threads for the
 * purposes of .eml export.
 *
 * .eml holds a single RFC2822 message, so a thread has to be narrowed to one.
 * Everywhere in the app we use the same convention: the most recent message in
 * the thread. Drafts are skipped — they only exist locally, so the sync engine
 * has no raw source to hand back for them.
 *
 * Threads with no exportable message are omitted, so the result may be shorter
 * than `threadIds`.
 */
export async function newestExportableMessagesForThreadIds(
  threadIds: string[]
): Promise<Message[]> {
  if (!threadIds.length) {
    return [];
  }
  const messages = await Promise.all(
    threadIds.map(async (threadId) => {
      const found = await DatabaseStore.findAll<Message>(Message, { threadId, draft: false })
        .order(Message.attributes.date.descending())
        .limit(1);
      return found.length ? found[0] : null;
    })
  );
  return messages.filter((m) => m !== null);
}

/**
 * Ask the sync engine for the raw RFC2822 source of each message and write it
 * to a temporary .eml file on disk.
 *
 * Each message is staged into its own randomly named subdirectory so that
 * concurrent stages of the same message can't overwrite one another, and so
 * that the file basename can be a clean, human-readable name (it becomes the
 * attachment's display name when the file is attached to a draft). By default
 * the name comes from the subject; pass `filename` to override it.
 *
 * The fetch is remote, so it may fail — and a GetMessageRFC2822Task can reach
 * `complete` without having written anything. Messages whose file never
 * appeared are omitted from the result, so callers should compare the returned
 * length against what they passed in to detect partial failures.
 */
export async function stageMessagesAsEml(
  messages: Message[],
  { filename }: { filename?: string } = {}
): Promise<StagedEml[]> {
  if (!messages.length) {
    return [];
  }

  const staged = messages.map((message) => {
    const token = crypto.randomBytes(4).toString('hex');
    const dir = path.join(os.tmpdir(), `mailspring-eml-${message.id}-${token}`);
    const basename = filename || defaultEmlFilename(message.subject);
    return { message, dir, filePath: path.join(dir, basename) };
  });

  // Queue every fetch before awaiting any of them so a multi-message stage
  // isn't serialized on the sync engine's round trips.
  const tasks = staged.map(({ message, dir, filePath }) => {
    fs.mkdirSync(dir, { recursive: true });
    const task = new GetMessageRFC2822Task({
      messageId: message.id,
      accountId: message.accountId,
      filepath: filePath,
    });
    Actions.queueTask(task);
    return task;
  });

  await Promise.all(tasks.map((task) => TaskQueue.waitForPerformRemote(task)));

  return staged
    .filter(({ filePath }) => fs.existsSync(filePath))
    .map(({ message, filePath }) => ({ message, filePath }));
}

/**
 * Convenience wrapper over the two steps above: turn a set of thread ids into
 * staged .eml files ready to be attached to a draft.
 */
export async function stageThreadsAsEml(threadIds: string[]): Promise<StagedEml[]> {
  const messages = await newestExportableMessagesForThreadIds(threadIds);
  if (!messages.length) {
    return [];
  }
  return stageMessagesAsEml(messages);
}
