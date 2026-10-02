import { DatabaseStore, Message } from 'mailspring-exports';

const CHUNK_SIZE = 500;

function fetchChunk(accountIds: string[], startUnix: number, endUnix: number) {
  return new Promise<Message[]>((resolve) => {
    window.requestAnimationFrame(() => {
      DatabaseStore.findAll<Message>(Message)
        .background()
        .where(Message.attributes.accountId.in(accountIds))
        .where(Message.attributes.date.greaterThan(new Date(startUnix * 1000)))
        .where(Message.attributes.date.lessThan(new Date(endUnix * 1000)))
        .order(Message.attributes.date.ascending())
        .limit(CHUNK_SIZE)
        .then(resolve);
    });
  });
}

/**
 * Visits every non-draft message in the accounts and date range, oldest first,
 * fetching in chunks between animation frames so the UI stays responsive.
 * Returns false if `isCancelled()` became true before the scan finished.
 */
export async function forEachMessageIn(
  accountIds: string[],
  startUnix: number,
  endUnix: number,
  callback: (message: Message, messageUnix: number) => void | Promise<void>,
  isCancelled: () => boolean = () => false
) {
  let chunkStartUnix = startUnix;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await fetchChunk(accountIds, chunkStartUnix, endUnix);
    if (isCancelled()) {
      return false;
    }
    for (const message of messages) {
      const messageUnix = message.date.getTime() / 1000;
      chunkStartUnix = Math.max(chunkStartUnix, messageUnix);
      if (message.draft) {
        continue;
      }
      await callback(message, messageUnix);
    }
    if (messages.length < CHUNK_SIZE) {
      return true;
    }
  }
}
