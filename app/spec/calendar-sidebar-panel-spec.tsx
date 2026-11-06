import { MessageStore } from 'mailspring-exports';
import { SidebarCalendarPanel } from '../internal_packages/main-calendar/lib/sidebar-calendar-panel';
import * as invitationVersions from '../internal_packages/events/lib/invitation-versions';
import * as unsentChangeDialog from '../internal_packages/main-calendar/lib/core/unsent-change-dialog';
import * as calendarDataSource from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const INTERVIEW = { id: 'interview', calendarId: 'cal-1', isRecurring: false, title: 'Interview' };
const EMAILED = { icsuid: 'interview@test', accountId: 'a1', calendarId: 'cal-1' };

function sidebarPanel() {
  const claimActive = jasmine.createSpy('claimActive');
  const panel = new SidebarCalendarPanel({ active: true, claimActive });
  panel.setState = (update: any) =>
    Object.assign(panel.state, typeof update === 'function' ? update(panel.state) : update);
  return { panel, claimActive };
}

describe('SidebarCalendarPanel following the email being read', function () {
  let threadId: string;
  let emailed: typeof EMAILED | null;

  beforeEach(function () {
    threadId = 'thread-1';
    emailed = EMAILED;
    spyOn(MessageStore, 'threadId').andCallFake(() => threadId);
    spyOn(MessageStore, 'items').andReturn([]);
    spyOn(invitationVersions, 'emailedEventIn').andCallFake(() => Promise.resolve(emailed));
  });

  function following() {
    const { panel, claimActive } = sidebarPanel();
    panel.state.calendarsLoaded = true;
    spyOn(calendarDataSource, 'focusedOccurrenceForIcsuid').andCallFake((e: typeof EMAILED) =>
      Promise.resolve(e === EMAILED ? INTERVIEW : null)
    );
    return { panel, claimActive };
  }

  it("opens an email's event and claims the sidebar for it", async function () {
    const { panel, claimActive } = following();
    await panel._onMessagesChange();

    expect(panel.state.shown).toBe(INTERVIEW);
    expect(panel.state.inThisEmail).toBe(INTERVIEW);
    expect(claimActive).toHaveBeenCalledWith(true);
  });

  it('goes back to the agenda and lets the sidebar go for an email without one', async function () {
    const { panel, claimActive } = following();
    await panel._onMessagesChange();
    threadId = 'thread-2';
    emailed = null;
    await panel._onMessagesChange();

    expect(panel.state.shown).toBe(null);
    expect(panel.state.inThisEmail).toBe(null);
    expect(claimActive.mostRecentCall.args).toEqual([false]);
  });

  it('leaves the agenda alone once the email is followed, so the last click wins', async function () {
    const { panel } = following();
    await panel._onMessagesChange();
    panel._onBack();
    // The store triggers again, as it does when a message expands.
    await panel._onMessagesChange();

    expect(panel.state.shown).toBe(null);
    expect(panel.state.inThisEmail).toBe(INTERVIEW);
  });

  it('opens the event once its attachment lands, after the email opened without it', async function () {
    const { panel, claimActive } = following();
    emailed = null;
    await panel._onMessagesChange();
    emailed = EMAILED;
    await panel._onMessagesChange();

    expect(panel.state.shown).toBe(INTERVIEW);
    expect(claimActive.mostRecentCall.args).toEqual([true]);
  });
});

describe('SidebarCalendarPanel closing with a change held for Send update', function () {
  const held = { eventId: 'interview', edits: [{ property: 'summary', value: 'Interview loop' }] };

  it('asks to send or discard it, without keeping the panel open', function () {
    const { panel } = sidebarPanel();
    panel.state.shown = INTERVIEW as any;
    panel.state.unsentChange = held as any;
    spyOn(unsentChangeDialog, 'showUnsentChangeDialog').andReturn('send');
    spyOn(panel, '_writeUnsentChange').andReturn(Promise.resolve());

    panel.componentWillUnmount();

    expect(unsentChangeDialog.showUnsentChangeDialog).toHaveBeenCalledWith(held, INTERVIEW, {
      canKeepEditing: false,
    });
    expect(panel._writeUnsentChange).toHaveBeenCalledWith(held, 'this-occurrence');
  });
});
