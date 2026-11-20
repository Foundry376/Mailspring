import { Message, Utils } from 'mailspring-exports';

const messageListComparisons = new WeakMap<Message[], WeakMap<Message[], boolean>>();

// Every message row receives the same `messages` array, so a MessageStore update would
// otherwise deep-compare the whole thread once per row (O(n²) in the thread's length).
// Each pair of arrays is compared once and the answer shared by every row.
export function messageRenderPropsEqual<T extends { messages: Message[] }>(next: T, previous: T) {
  const { messages: nextMessages, ...nextProps } = next;
  const { messages: previousMessages, ...previousProps } = previous;
  if (!Utils.isEqualReact(nextProps, previousProps)) return false;
  if (nextMessages === previousMessages) return true;

  let comparisons = messageListComparisons.get(previousMessages);
  if (!comparisons) {
    comparisons = new WeakMap<Message[], boolean>();
    messageListComparisons.set(previousMessages, comparisons);
  }
  const cached = comparisons.get(nextMessages);
  if (cached !== undefined) return cached;

  const equal = Utils.isEqualReact(nextMessages, previousMessages);
  comparisons.set(nextMessages, equal);
  return equal;
}
