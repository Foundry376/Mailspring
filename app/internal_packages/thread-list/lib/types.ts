import { Message, Thread, Highlighted, SearchHighlighter } from 'mailspring-exports';

export interface SearchMatch {
  highlighter: SearchHighlighter;
  // The words around the match, when the body matched.
  excerpt?: Highlighted;
}

export interface ThreadWithMessagesMetadata extends Thread {
  __messages: Message[];
  // Set on search results.
  __searchMatch?: SearchMatch;
}
