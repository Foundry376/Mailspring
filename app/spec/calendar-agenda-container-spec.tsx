import { SidebarAgendaPanel } from '../internal_packages/main-calendar/lib/sidebar-agenda-panel';
import { AgendaContainer } from '../internal_packages/main-calendar/lib/core/agenda-container';
import { AgendaPanel } from '../internal_packages/main-calendar/lib/core/agenda-panel';

describe('AgendaContainer', function () {
  const container = (onEventClick?: jasmine.Spy) => {
    const c = new AgendaContainer({ className: 'somewhere', onEventClick });
    c.setState = (update: object) => Object.assign(c.state, update);
    return c;
  };

  it('draws the agenda panel inside the calendar styles, with nothing selected', function () {
    const shown = container().render();
    expect(shown.props.className).toBe('mailspring-calendar somewhere');
    expect(shown.props.children.type).toBe(AgendaPanel);
    expect(shown.props.children.props.selectedEvents).toEqual([]);
  });

  it('selects the event clicked and tells its owner, fail-closed on writes until calendars load', function () {
    const onEventClick = jasmine.createSpy('onEventClick');
    const c = container(onEventClick);
    const agenda = c.render().props.children;

    agenda.props.onEventClick({}, { id: 'e1' });
    expect(c.state.selectedEvents.map((e) => e.id)).toEqual(['e1']);
    expect(onEventClick).toHaveBeenCalledWith({ id: 'e1' });
    expect(agenda.props.isCalendarReadOnly('cal-1')).toBe(true);
  });
});

describe('SidebarAgendaPanel', function () {
  it('shows the agenda while its tab is active, and nothing otherwise', function () {
    const shown = new SidebarAgendaPanel({ active: true }).render();
    expect(shown.type).toBe(AgendaContainer);
    expect(new SidebarAgendaPanel({ active: false }).render()).toBe(null);
  });
});
