import { formatCalendarDate } from '../src/calendar-date';
// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  createDragPreviewEvent,
  canMoveEvent,
  snapAllDayTimes,
  createDragState,
  updateDragState,
} from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import { MONTH_VIEW_DRAG_CONFIG } from '../internal_packages/main-calendar/lib/core/calendar-drag-types';
import {
  EventOccurrence,
  TimedOccurrence,
  coveredDates,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const HOUR = 60 * 60;

// Fixtures still specify all-day events by the instants they span; makeOccurrence derives the
// dates and emits the right variant, so callers can't encode a shape production never emits.
type OccurrenceOverrides = Partial<Omit<TimedOccurrence, 'isAllDay'>> & { isAllDay?: boolean };

function makeOccurrence(overrides: OccurrenceOverrides = {}): EventOccurrence {
  const nowUnix = Date.now() / 1000;
  const { start = nowUnix + HOUR, end = nowUnix + 2 * HOUR, isAllDay = false, ...rest } = overrides;
  const base = {
    id: 'event-1-e0',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: 'Standup',
    location: '',
    description: '',
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    ...rest,
    ...coveredDates(start, end, isAllDay),
  };
  return isAllDay ? { ...base, isAllDay: true } : { ...base, isAllDay: false, start, end };
}

describe('canMoveEvent', function () {
  it('allows moving an upcoming event', function () {
    expect(canMoveEvent(makeOccurrence())).toBe(true);
  });

  it('allows moving a past event on an editable calendar', function () {
    const nowUnix = Date.now() / 1000;
    const past = makeOccurrence({ start: nowUnix - 2 * HOUR, end: nowUnix - HOUR });
    expect(canMoveEvent(past)).toBe(true);
  });

  it('allows moving a past all-day event', function () {
    const nowUnix = Date.now() / 1000;
    const pastAllDay = makeOccurrence({
      isAllDay: true,
      start: nowUnix - 48 * HOUR,
      end: nowUnix - 24 * HOUR,
    });
    expect(canMoveEvent(pastAllDay)).toBe(true);
  });

  it('blocks moving an event in a read-only calendar', function () {
    expect(canMoveEvent(makeOccurrence(), true)).toBe(false);
  });

  it('blocks moving a cancelled event', function () {
    expect(canMoveEvent(makeOccurrence({ isCancelled: true }))).toBe(false);
  });
});

describe('snapAllDayTimes', function () {
  // Local midnights: all-day times are built from local date components.
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;
  const JUN22 = day(2026, 6, 22);
  const JUN23 = day(2026, 6, 23);

  it('snaps an inclusive end-of-day end to the next midnight', function () {
    expect(snapAllDayTimes(JUN22 + 9 * 3600, JUN23 - 1)).toEqual({
      start: JUN22,
      end: JUN23,
    });
  });

  it('leaves an already-exclusive end unchanged, so repeated drags do not grow the event', function () {
    expect(snapAllDayTimes(JUN22, JUN23)).toEqual({
      start: JUN22,
      end: JUN23,
    });
    const once = snapAllDayTimes(JUN22, JUN23 - 1);
    expect(snapAllDayTimes(once.start, once.end)).toEqual(once);
  });

  it('gives a degenerate end a full day rather than zero length', function () {
    expect(snapAllDayTimes(JUN22, JUN22)).toEqual({
      start: JUN22,
      end: JUN23,
    });
  });

  it('preserves a multi-day span', function () {
    expect(snapAllDayTimes(day(2026, 6, 20), JUN23)).toEqual({
      start: day(2026, 6, 20),
      end: JUN23,
    });
  });

  it('always returns at least one whole day', function () {
    [JUN22 - 1, JUN22, JUN22 + 1, JUN23 - 1, JUN23].forEach((end) => {
      const snapped = snapAllDayTimes(JUN22, end);
      expect(snapped.end).toBeGreaterThan(snapped.start);
    });
  });
});

describe('updateDragState with day snapping', function () {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;

  // Drags an all-day event's edge and returns the resulting preview range.
  function dragEdge(
    start: number,
    end: number,
    mode: 'resize-start' | 'resize-end',
    mouseTime: number
  ) {
    const event = makeOccurrence({ isAllDay: true, start, end });
    const cursor = mode === 'resize-start' ? 'ew-resize' : 'ew-resize';
    const state = createDragState(event, { mode, cursor }, mouseTime, 0, 0, MONTH_VIEW_DRAG_CONFIG);
    // Move far enough to clear the drag threshold
    const dragged = updateDragState(
      state,
      mouseTime,
      100,
      100,
      'month-cell',
      MONTH_VIEW_DRAG_CONFIG
    );
    return { start: dragged.previewStart, end: dragged.previewEnd };
  }

  it('never previews less than one whole day', function () {
    // resize-end dragged back before the start
    expect(dragEdge(day(2026, 8, 14), day(2026, 8, 15), 'resize-end', day(2026, 8, 12))).toEqual({
      start: day(2026, 8, 14),
      end: day(2026, 8, 15),
    });
    // resize-start dragged past the end
    expect(dragEdge(day(2026, 8, 14), day(2026, 8, 15), 'resize-start', day(2026, 8, 20))).toEqual({
      start: day(2026, 8, 14),
      end: day(2026, 8, 15),
    });
  });

  it('extends a multi-day span to the day the cursor is in', function () {
    expect(dragEdge(day(2026, 8, 14), day(2026, 8, 16), 'resize-end', day(2026, 8, 18))).toEqual({
      start: day(2026, 8, 14),
      end: day(2026, 8, 19),
    });
  });

  it('keeps the last day when the right edge is grabbed without moving', function () {
    // Containers hand over the day's exact midnight, so a jiggle inside the last cell
    // must not shrink the event. Aug 14 -> Aug 17 covers 14-16; cursor sits on the 16th.
    expect(dragEdge(day(2026, 8, 14), day(2026, 8, 17), 'resize-end', day(2026, 8, 16))).toEqual({
      start: day(2026, 8, 14),
      end: day(2026, 8, 17),
    });
  });

  it('shrinks a span to the cursor day rather than one short of it', function () {
    expect(dragEdge(day(2026, 8, 14), day(2026, 8, 20), 'resize-end', day(2026, 8, 16))).toEqual({
      start: day(2026, 8, 14),
      end: day(2026, 8, 17),
    });
  });
});

describe('updateDragState move with day snapping', function () {
  const localDay = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;

  // Drops an all-day event on the day containing mouseTime and returns the preview range.
  function dragMove(start: number, end: number, mouseTime: number) {
    const event = makeOccurrence({ isAllDay: true, start, end });
    const state = createDragState(
      event,
      { mode: 'move', cursor: 'move' },
      mouseTime,
      0,
      0,
      MONTH_VIEW_DRAG_CONFIG
    );
    const dragged = updateDragState(
      state,
      mouseTime,
      100,
      100,
      'month-cell',
      MONTH_VIEW_DRAG_CONFIG
    );
    return { start: dragged.previewStart, end: dragged.previewEnd };
  }

  it('moves a one-day event to the drop day, ending on the next midnight', function () {
    expect(dragMove(localDay(2026, 8, 14), localDay(2026, 8, 15), localDay(2026, 8, 20))).toEqual({
      start: localDay(2026, 8, 20),
      end: localDay(2026, 8, 21),
    });
  });

  it('preserves the span of a multi-day event', function () {
    expect(dragMove(localDay(2026, 8, 14), localDay(2026, 8, 17), localDay(2026, 8, 20))).toEqual({
      start: localDay(2026, 8, 20),
      end: localDay(2026, 8, 23),
    });
  });

  // A midnight-gap block lived here, pinned with moment.tz.setDefault. The move path now
  // computes through calendar-date, which setDefault cannot reach — and the runner's pinned
  // zone transitions at 2am, so it has no missing midnight either. That case is uncovered.
});

describe('createDragPreviewEvent', function () {
  const localDay = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;
  const covered = (occ: EventOccurrence) => [
    formatCalendarDate(occ.startDate),
    formatCalendarDate(occ.endDate),
  ];

  // The preview spreads the original occurrence, so its dates have to be recomputed from the
  // preview instants or they describe where the event was before the drag.
  it('moves an all-day preview onto the dragged days', function () {
    const event = makeOccurrence({
      isAllDay: true,
      start: localDay(2026, 6, 21),
      end: localDay(2026, 6, 22),
    });
    const preview = createDragPreviewEvent({
      event,
      previewStart: localDay(2026, 6, 24),
      previewEnd: localDay(2026, 6, 25),
    } as any);
    expect(covered(preview)).toEqual(['2026-06-24', '2026-06-24']);
  });

  it('keeps a multi-day all-day span the same length', function () {
    const event = makeOccurrence({
      isAllDay: true,
      start: localDay(2026, 6, 21),
      end: localDay(2026, 6, 24),
    });
    const preview = createDragPreviewEvent({
      event,
      previewStart: localDay(2026, 6, 28),
      previewEnd: localDay(2026, 7, 1),
    } as any);
    expect(covered(preview)).toEqual(['2026-06-28', '2026-06-30']);
  });

  it('moves a timed preview onto the dragged day', function () {
    const event = makeOccurrence({
      isAllDay: false,
      start: localDay(2026, 6, 21) + 10 * HOUR,
      end: localDay(2026, 6, 21) + 11 * HOUR,
    });
    const preview = createDragPreviewEvent({
      event,
      previewStart: localDay(2026, 6, 25) + 10 * HOUR,
      previewEnd: localDay(2026, 6, 25) + 11 * HOUR,
    } as any);
    expect(covered(preview)).toEqual(['2026-06-25', '2026-06-25']);
  });
});
