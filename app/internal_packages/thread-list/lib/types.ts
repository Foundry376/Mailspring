import { Message, Thread } from 'mailspring-exports';

export interface ThreadWithMessagesMetadata extends Thread {
  __messages: Message[];
}
