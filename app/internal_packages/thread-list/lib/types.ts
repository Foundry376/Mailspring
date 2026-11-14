import { Message, Thread } from 'mailspring-exports';

// Mirrors thread-search's search-highlighter types, which this package can't import.
export type Highlighted = { text: string; match: boolean }[];
type Highlighter = (text: string) => Highlighted | null;

export interface SearchMatch {
  highlighter: { subject: Highlighter; participants: Highlighter };
  // The words around the match, when the body matched.
  excerpt?: Highlighted;
}

export interface ThreadWithMessagesMetadata extends Thread {
  __messages: Message[];
  // Set on search results.
  __searchMatch?: SearchMatch;
}
