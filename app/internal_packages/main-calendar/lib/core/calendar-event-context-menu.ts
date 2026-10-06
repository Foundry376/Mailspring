import { ICSParticipantStatus, localized } from 'mailspring-exports';
import { EventOccurrence } from './calendar-data-source';
import { canRespondToEvent, myParticipationStatus, respondToCalendarEvent } from './calendar-rsvp';

type TemplateItem =
  | { label: string; click: () => void; type?: 'checkbox'; checked?: boolean; enabled?: boolean }
  | { type: 'separator' };

const isSeparator = (item: TemplateItem) => (item as { type?: string }).type === 'separator';

/** Removes the separators left behind when optional items are dropped: collapse runs, then trim both ends. */
function trimSeparators(items: TemplateItem[]): TemplateItem[] {
  const collapsed = items.filter(
    (item, i) => !(isSeparator(item) && i > 0 && isSeparator(items[i - 1]))
  );
  let start = 0;
  let end = collapsed.length;
  while (start < end && isSeparator(collapsed[start])) start++;
  while (end > start && isSeparator(collapsed[end - 1])) end--;
  return collapsed.slice(start, end);
}

interface CalendarEventContextMenuOptions {
  occurrence: EventOccurrence;
  /** Whether the event's calendar refuses writes, which hides everything that changes it. */
  readOnly: boolean;
  onOpen: () => void;
  onDelete: () => void;
  /** Offer a different time to the organizer. See proposeNewTimeForCalendarEvent. */
  onProposeNewTime: () => void;
}

/** The right-click menu for an event in the calendar. */
export class CalendarEventContextMenu {
  private opts: CalendarEventContextMenuOptions;

  constructor(opts: CalendarEventContextMenuOptions) {
    this.opts = opts;
  }

  private rsvpItems(): TemplateItem[] {
    const { occurrence, readOnly } = this.opts;
    if (!canRespondToEvent(occurrence)) {
      return [];
    }

    const current = myParticipationStatus(occurrence);
    const actions: [ICSParticipantStatus, string][] = [
      ['ACCEPTED', localized('Accept')],
      ['TENTATIVE', localized('Maybe')],
      ['DECLINED', localized('Decline')],
    ];

    const items: TemplateItem[] = actions.map(([status, label]) => ({
      label,
      type: 'checkbox' as const,
      checked: current === status,
      // Answering writes our status onto the event; the reply email alone would leave the two apart.
      enabled: !readOnly,
      click: () => {
        respondToCalendarEvent(occurrence, status);
      },
    }));

    // A counter only sends mail, so a read-only calendar is no obstacle.
    items.push({
      label: localized('Propose New Time') + '...',
      click: this.opts.onProposeNewTime,
    });

    return items;
  }

  template(): TemplateItem[] {
    const { occurrence, readOnly, onOpen, onDelete } = this.opts;
    // A writable calendar and a meeting we organize (RFC 5546 section 2.1.4); an attendee gets
    // "View Event". Deleting our own copy of someone else's meeting stays governed by readOnly.
    const editable = !readOnly && occurrence.isMine;

    const items: (TemplateItem | null)[] = [
      {
        label: editable ? localized('Edit Event') + '...' : localized('View Event'),
        click: onOpen,
      },
      { type: 'separator' },
      ...this.rsvpItems(),
      { type: 'separator' },
      readOnly ? null : { label: localized('Delete Event'), click: onDelete },
    ];

    return trimSeparators(items.filter(Boolean) as TemplateItem[]);
  }

  displayMenu() {
    require('@electron/remote').Menu.buildFromTemplate(this.template()).popup({});
  }
}
