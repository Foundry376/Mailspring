import { Thread, Message, Contact, Category } from 'mailspring-exports';

/**
 * Discriminated union type representing either a Thread or a Message.
 * This allows us to handle both in the same UI components.
 */
export type ThreadOrMessage =
    | { type: 'thread'; item: Thread }
    | { type: 'message'; item: Message };

/**
 * Type guard to check if an item is a Thread
 */
export function isThreadItem(item: ThreadOrMessage): item is { type: 'thread'; item: Thread } {
    return item.type === 'thread';
}

/**
 * Type guard to check if an item is a Message
 */
export function isMessageItem(item: ThreadOrMessage): item is { type: 'message'; item: Message } {
    return item.type === 'message';
}

/**
 * Type guard to check if a raw model is a Thread
 */
export function isThread(item: Thread | Message): item is Thread {
    return item instanceof Thread || (item as any).__messages !== undefined;
}

/**
 * Type guard to check if a raw model is a Message
 */
export function isMessage(item: Thread | Message): item is Message {
    return item instanceof Message || (item as any).threadId !== undefined;
}

/**
 * ItemAdapter provides a unified interface for accessing properties
 * of both Threads and Messages. This allows UI components to work
 * with either type without duplicating code.
 */
export class ItemAdapter {
    /**
     * Get the subject line
     */
    static getSubject(item: Thread | Message): string {
        return item.subject || '';
    }

    /**
     * Get the snippet/preview text
     */
    static getSnippet(item: Thread | Message): string {
        if (isThread(item)) {
            // For threads, try to get snippet from messages if available
            const messages = (item as any).__messages || [];
            if (messages.length > 0) {
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].snippet) {
                        return messages[i].snippet;
                    }
                }
            }
            return item.snippet || '';
        } else {
            return item.snippet || '';
        }
    }

    /**
     * Check if the item is unread
     */
    static isUnread(item: Thread | Message): boolean {
        return item.unread || false;
    }

    /**
     * Check if the item is starred
     */
    static isStarred(item: Thread | Message): boolean {
        return item.starred || false;
    }

    /**
     * Get the primary date for the item
     * For threads: last received message timestamp (or sent if in Sent folder)
     * For messages: the message date
     */
    static getDate(item: Thread | Message): Date {
        if (isThread(item)) {
            return item.lastMessageReceivedTimestamp || item.firstMessageTimestamp || new Date(0);
        } else {
            return item.date || new Date(0);
        }
    }

    /**
     * Get the timestamp for sent messages
     */
    static getSentDate(item: Thread | Message): Date {
        if (isThread(item)) {
            return item.lastMessageSentTimestamp || new Date(0);
        } else {
            return item.date || new Date(0);
        }
    }

    /**
     * Get the list of participants
     * For threads: aggregated participants from all messages
     * For messages: just the from/to contacts
     */
    static getParticipants(item: Thread | Message): Contact[] {
        if (isThread(item)) {
            return item.participants || [];
        } else {
            // For individual messages, combine from/to/cc
            const participants: Contact[] = [];
            if (item.from) participants.push(...item.from);
            if (item.to) participants.push(...item.to);
            if (item.cc) participants.push(...item.cc);
            return participants;
        }
    }

    /**
     * Get the "from" contacts
     */
    static getFrom(item: Thread | Message): Contact[] {
        if (isThread(item)) {
            // For threads, get from field from messages
            const messages = (item as any).__messages || [];
            if (messages.length > 0) {
                return messages[messages.length - 1].from || [];
            }
            return [];
        } else {
            return item.from || [];
        }
    }

    /**
     * Get the "to" contacts
     */
    static getTo(item: Thread | Message): Contact[] {
        if (isThread(item)) {
            // For threads, get to field from messages
            const messages = (item as any).__messages || [];
            if (messages.length > 0) {
                return messages[messages.length - 1].to || [];
            }
            return [];
        } else {
            return item.to || [];
        }
    }

    /**
     * Get the categories (folders/labels)
     */
    static getCategories(item: Thread | Message): Category[] {
        if (isThread(item)) {
            return item.categories || [];
        } else {
            // Messages have folder and/or labels
            const categories: Category[] = [];
            if (item.folder) {
                categories.push(item.folder);
            }
            if ((item as any).labels) {
                categories.push(...(item as any).labels);
            }
            return categories;
        }
    }

    /**
     * Get the unique ID
     */
    static getId(item: Thread | Message): string {
        return item.id;
    }

    /**
     * Get the account ID
     */
    static getAccountId(item: Thread | Message): string {
        return item.accountId;
    }

    /**
     * Get the thread ID (for messages) or the item's own ID (for threads)
     */
    static getThreadId(item: Thread | Message): string {
        if (isThread(item)) {
            return item.id;
        } else {
            return item.threadId;
        }
    }

    /**
     * Check if this is a draft
     */
    static isDraft(item: Thread | Message): boolean {
        if (isThread(item)) {
            const messages = (item as any).__messages || [];
            return messages.some(m => m.draft);
        } else {
            return item.draft || false;
        }
    }

    /**
     * Get attachment count
     */
    static getAttachmentCount(item: Thread | Message): number {
        if (isThread(item)) {
            return item.attachmentCount || 0;
        } else {
            return (item.files || []).length;
        }
    }

    /**
     * Get the files/attachments
     */
    static getFiles(item: Thread | Message): any[] {
        if (isThread(item)) {
            // For threads, we'd need to aggregate from messages
            const messages = (item as any).__messages || [];
            const files = [];
            for (const message of messages) {
                if (message.files) {
                    files.push(...message.files);
                }
            }
            return files;
        } else {
            return item.files || [];
        }
    }

    /**
     * Get the messages array (only for threads)
     */
    static getMessages(item: Thread | Message): Message[] {
        if (isThread(item)) {
            return (item as any).__messages || [];
        } else {
            return [item]; // For a message, return it as a single-item array
        }
    }

    /**
     * Get message count
     */
    static getMessageCount(item: Thread | Message): number {
        if (isThread(item)) {
            const messages = (item as any).__messages || [];
            return messages.length;
        } else {
            return 1; // A message is always count of 1
        }
    }

    /**
     * Check if the item is from the current user
     */
    static isFromMe(item: Thread | Message): boolean {
        if (isThread(item)) {
            const messages = (item as any).__messages || [];
            if (messages.length === 0) return false;
            return messages.every(m => m.isFromMe());
        } else {
            return item.isFromMe();
        }
    }

    /**
     * Create a wrapped item for type-safe usage
     */
    static wrap(item: Thread | Message): ThreadOrMessage {
        if (isThread(item)) {
            return { type: 'thread', item };
        } else {
            return { type: 'message', item };
        }
    }

    /**
     * Unwrap to get the raw item
     */
    static unwrap(wrapped: ThreadOrMessage): Thread | Message {
        return wrapped.item;
    }
}
