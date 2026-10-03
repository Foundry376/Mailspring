import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';
import moment from 'moment';
import { Actions } from 'mailspring-exports';
import { ProposeTimePopover } from '../../src/components/propose-time-popover';
import { DatePicker } from '../../src/components/date-picker';
import TimePicker from '../../src/components/time-picker';

// 2026-03-10 is clear of the 2026-03-08 transition; the runner's zone is America/Chicago.
const START = moment('2026-03-10 14:00', 'YYYY-MM-DD HH:mm').unix();
const END = START + 30 * 60;
const MIDNIGHT = moment('2026-03-10', 'YYYY-MM-DD').unix();

describe('ProposeTimePopover', function () {
  let onPropose: jasmine.Spy;
  let popover: ProposeTimePopover;

  beforeEach(() => spyOn(Actions, 'closePopover'));

  function mount(props: { start: number; end: number; isAllDay?: boolean }) {
    onPropose = jasmine.createSpy('onPropose');
    popover = ReactTestUtils.renderIntoDocument(
      <ProposeTimePopover {...props} onPropose={onPropose} />
    ) as unknown as ProposeTimePopover;
  }
  const proposal = () =>
    onPropose.mostRecentCall.args[0] as { start: Date; end: Date; comment: string };
  const proposeButton = () =>
    ReactTestUtils.scryRenderedDOMComponentsWithTag(popover, 'button').find(
      (b) => b.textContent === 'Propose'
    ) as HTMLButtonElement;
  const original = () =>
    ReactTestUtils.findRenderedDOMComponentWithClass(popover, 'propose-time-original').textContent;

  describe('for a timed invitation', function () {
    beforeEach(() => mount({ start: START, end: END }));

    it('shows the slot it would replace, and offers times', function () {
      expect(original()).toBe('Currently Tue, Mar 10 · 2:00 PM – 2:30 PM');
      expect(ReactTestUtils.scryRenderedComponentsWithType(popover, TimePicker).length).toBe(2);
      expect(ReactTestUtils.scryRenderedComponentsWithType(popover, DatePicker).length).toBe(1);
    });

    it('cannot propose the time it already has', function () {
      expect(proposeButton().disabled).toBe(true);
    });

    it('carries the end along when the start moves, then proposes', function () {
      popover._onChangeStartTime(moment('2026-03-10 16:00', 'YYYY-MM-DD HH:mm').valueOf());
      popover._onChangeDay(moment('2026-03-12', 'YYYY-MM-DD').valueOf());
      expect(proposeButton().disabled).toBe(false);
      ReactTestUtils.Simulate.click(proposeButton());
      expect(proposal().start.toISOString()).toBe(new Date('2026-03-12T21:00:00Z').toISOString());
      expect(proposal().end.toISOString()).toBe(new Date('2026-03-12T21:30:00Z').toISOString());
      expect(Actions.closePopover).toHaveBeenCalled();
    });

    it('changes the duration when the end moves, never below a minute', function () {
      popover._onChangeEndTime(moment('2026-03-10 15:00', 'YYYY-MM-DD HH:mm').valueOf());
      expect(popover.state.end - popover.state.start).toBe(3600);
      popover._onChangeEndTime(moment('2026-03-10 09:00', 'YYYY-MM-DD HH:mm').valueOf());
      expect(popover.state.end - popover.state.start).toBe(60);
    });
  });

  describe('for an all-day invitation', function () {
    beforeEach(() => mount({ start: MIDNIGHT, end: MIDNIGHT + 86400, isAllDay: true }));

    it('shows dates only', function () {
      expect(original()).toBe('Currently Tue, Mar 10');
      expect(ReactTestUtils.scryRenderedComponentsWithType(popover, TimePicker).length).toBe(0);
      expect(ReactTestUtils.scryRenderedComponentsWithType(popover, DatePicker).length).toBe(2);
    });

    it('proposes whole days, keeping the length when the first day moves', function () {
      popover._onChangeDay(moment('2026-03-13', 'YYYY-MM-DD').valueOf());
      ReactTestUtils.Simulate.click(proposeButton());
      expect(moment(proposal().start).format('YYYY-MM-DD HH:mm')).toBe('2026-03-13 00:00');
      expect(moment(proposal().end).format('YYYY-MM-DD HH:mm')).toBe('2026-03-14 00:00');
    });

    it('lets the last day stretch the proposal, never before the first', function () {
      popover._onChangeLastDay(moment('2026-03-12', 'YYYY-MM-DD').valueOf());
      expect(popover.state.end).toBe(MIDNIGHT + 3 * 86400);
      popover._onChangeLastDay(moment('2026-03-01', 'YYYY-MM-DD').valueOf());
      expect(popover.state.end).toBe(MIDNIGHT + 86400);
    });

    it('names a span by its first and last day', function () {
      mount({ start: MIDNIGHT, end: MIDNIGHT + 3 * 86400, isAllDay: true });
      expect(original()).toBe('Currently Tue, Mar 10 – Thu, Mar 12');
    });
  });
});
