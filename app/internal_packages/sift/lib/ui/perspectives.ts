import {
  CategoryStore,
  DatabaseStore,
  FocusedPerspectiveStore,
  MailboxPerspective,
  MutableQuerySubscription,
  TaskFactory,
  Thread,
} from 'mailspring-exports';
import { insightStore, type Insight } from '../stores/insight-store';

type Kind = 'priority' | 'needs_reply';

const VIEWS: Record<Kind, { name: string; iconName: string; matches: (i: Insight) => boolean }> = {
  priority: {
    name: 'Priority',
    iconName: 'important.png',
    matches: (i) => i.priority === 'urgent' || i.priority === 'high' || !!i.security_warning,
  },
  needs_reply: {
    name: 'Needs reply',
    iconName: 'reminders.png',
    matches: (i) => i.needs_reply,
  },
};

// Only the focused perspective's subscription follows insight changes.
let detachLive: (() => void) | null = null;

/**
 * A mailbox view of inbox threads that Sift's triage put in a bucket. It
 * re-queries as triage results arrive, and archiving from it works as usual.
 */
export class SmartViewPerspective extends MailboxPerspective {
  kind: Kind;

  constructor(accountIds: string[], kind: Kind) {
    super(accountIds);
    this.kind = kind;
    this.name = VIEWS[kind].name;
    this.iconName = VIEWS[kind].iconName;
  }

  private query() {
    const ids = insightStore.threadIdsWhere(VIEWS[this.kind].matches);
    const inboxIds = this.accountIds
      .map((id: string) => CategoryStore.getInboxCategory(id)?.id)
      .filter(Boolean);
    return DatabaseStore.findAll<Thread>(Thread)
      .where({ id: ids.length ? ids : ['__none__'], accountId: this.accountIds })
      .where([Thread.attributes.categories.containsAny(inboxIds.length ? inboxIds : ['__none__'])])
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending());
  }

  threads() {
    const subscription = new MutableQuerySubscription<Thread>(this.query(), {
      emitResultSet: true,
    });
    detachLive?.();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = insightStore.listen(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const focused: MailboxPerspective = FocusedPerspectiveStore.current();
        if (focused === (this as MailboxPerspective)) subscription.replaceQuery(this.query());
      }, 750);
    });
    detachLive = () => {
      unlisten();
      if (timer) clearTimeout(timer);
    };
    return subscription;
  }

  unreadCount() {
    return 0;
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  tasksForRemovingItems(threads: any[], source: string) {
    return TaskFactory.tasksForArchiving({ threads, source });
  }

  emptyMessage() {
    return this.kind === 'priority'
      ? 'Nothing urgent. Sift will flag important mail here.'
      : 'No one is waiting on you.';
  }
}

export function sidebarExtension(kind: Kind) {
  return {
    name: `Sift ${VIEWS[kind].name}`,
    sidebarItem(accountIds: string[]) {
      return {
        id: `sift-${kind}`,
        name: VIEWS[kind].name,
        iconName: VIEWS[kind].iconName,
        perspective: new SmartViewPerspective(accountIds, kind),
        insertAtTop: true,
      };
    },
  };
}

export function stopLiveViews() {
  detachLive?.();
  detachLive = null;
}
