import { SidebarCalendarPanel } from '../internal_packages/main-calendar/lib/sidebar-calendar-panel';
import { AgendaContainer } from '../internal_packages/main-calendar/lib/core/agenda-container';
import { AgendaPanel } from '../internal_packages/main-calendar/lib/core/agenda-panel';

describe('AgendaContainer', function () {
  const container = (props: { onEventClick?: jasmine.Spy; selectedEvents?: any[] } = {}) => {
    const c = new AgendaContainer({ className: 'somewhere', ...props });
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
    const c = container({ onEventClick });
    const agenda = c.render().props.children;

    agenda.props.onEventClick({}, { id: 'e1' });
    expect(c.render().props.children.props.selectedEvents.map((e) => e.id)).toEqual(['e1']);
    expect(onEventClick).toHaveBeenCalledWith({}, { id: 'e1' });
    expect(agenda.props.isCalendarReadOnly('cal-1')).toBe(true);
  });

  it('shows the selection it is given instead of its own', function () {
    const c = container({ selectedEvents: [{ id: 'e2' }] });
    c.render().props.children.props.onEventClick({}, { id: 'e1' });
    expect(c.render().props.children.props.selectedEvents.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('SidebarCalendarPanel', function () {
  it('shows the agenda while its tab is active, and nothing otherwise', function () {
    const shown = new SidebarCalendarPanel({ active: true, claimActive: () => {} }).render();
    expect(shown.props.children[0].type).toBe(AgendaContainer);
    expect(new SidebarCalendarPanel({ active: false, claimActive: () => {} }).render()).toBe(null);
  });
});
