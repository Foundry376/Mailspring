import { SidebarAgendaPanel } from '../internal_packages/main-calendar/lib/sidebar-agenda-panel';
import { AgendaPanel } from '../internal_packages/main-calendar/lib/core/agenda-panel';

describe('SidebarAgendaPanel', function () {
  it("shows the calendar's agenda panel while its tab is active, and nothing otherwise", function () {
    const shown = new SidebarAgendaPanel({ active: true }).render();
    const agenda = shown.props.children;
    expect(agenda.type).toBe(AgendaPanel);
    expect(agenda.props.selectedEvents).toEqual([]);

    expect(new SidebarAgendaPanel({ active: false }).render()).toBe(null);
  });

  it('selects the event clicked, fail-closed on writes until calendars load', function () {
    const panel = new SidebarAgendaPanel({ active: true });
    panel.setState = (update: object) => Object.assign(panel.state, update);
    const agenda = panel.render().props.children;

    agenda.props.onEventClick({}, { id: 'e1' });
    expect(panel.state.selectedEvents.map((e) => e.id)).toEqual(['e1']);
    expect(agenda.props.isCalendarReadOnly('cal-1')).toBe(true);
  });
});
