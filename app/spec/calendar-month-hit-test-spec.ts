// Import directly from the source files; the plugin isn't registered in mailspring-exports.
import moment from 'moment';
import { CalendarEventContainer } from '../internal_packages/main-calendar/lib/core/calendar-event-container';
import { dayBoundsUnix } from '../internal_packages/main-calendar/lib/core/month-view-helpers';

// A month-cell container as MonthViewWeek and MonthViewDayCell render it, 300px wide.
function monthCell(firstISO: string, lastISO = firstISO) {
  const { start, end } = dayBoundsUnix(moment(firstISO), moment(lastISO));
  const el = document.createElement('div');
  el.dataset.calendarStart = `${start}`;
  el.dataset.calendarEnd = `${end}`;
  el.dataset.calendarType = 'month-cell';
  const chip = document.createElement('span');
  el.appendChild(chip);
  spyOn(el, 'getBoundingClientRect').and.returnValue({
    left: 0,
    top: 0,
    width: 300,
    height: 20,
  } as DOMRect);
  return chip;
}

function dayUnder(target: HTMLElement, clientX: number) {
  const container = new CalendarEventContainer({} as any);
  return container._dataFromMouseEvent({ target, clientX, clientY: 10 } as any).time;
}

describe('the month-cell hit-test', function () {
  it('reads the day under the cursor across a bar', function () {
    const bar = monthCell('2026-10-06', '2026-10-08');
    expect(dayUnder(bar, 10)).toBe(moment('2026-10-06').unix());
    expect(dayUnder(bar, 150)).toBe(moment('2026-10-07').unix());
    expect(dayUnder(bar, 290)).toBe(moment('2026-10-08').unix());
  });

  it('reads a day cell as its own day wherever the cursor is', function () {
    const cell = monthCell('2026-03-08');
    expect(dayUnder(cell, 10)).toBe(moment('2026-03-08').unix());
    expect(dayUnder(cell, 290)).toBe(moment('2026-03-08').unix());
  });
});
