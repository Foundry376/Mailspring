import React from 'react';
import { HeaderControls } from './header-controls';
import CalendarHeaderStore from './calendar-header-store';
import { CalendarView } from './calendar-constants';
import { EventSearchBar } from './event-search-bar';

export class CalendarHeader extends React.Component<Record<string, unknown>> {
  static displayName = 'CalendarHeader';

  _unlisten?: () => void;

  componentDidMount() {
    this._unlisten = CalendarHeaderStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._unlisten?.();
  }

  // The store keeps actions current without a redraw, so read them when they're used.
  _prev = () => CalendarHeaderStore.viewNavigation()?.prevAction();
  _next = () => CalendarHeaderStore.viewNavigation()?.nextAction();
  _today = () => CalendarHeaderStore.viewNavigation()?.todayAction();
  _changeView = (view: CalendarView) => CalendarHeaderStore.calendarOptions()?.onChangeView(view);
  _toggleAgenda = () => CalendarHeaderStore.calendarOptions()?.onToggleAgenda();

  render() {
    const navigation = CalendarHeaderStore.viewNavigation();
    const options = CalendarHeaderStore.calendarOptions();
    if (!navigation || !options) {
      return null;
    }
    return (
      <HeaderControls
        arrows={navigation.arrows}
        view={options.view}
        agendaOpen={options.agendaOpen}
        prevAction={this._prev}
        nextAction={this._next}
        todayAction={this._today}
        onChangeView={this._changeView}
        onToggleAgenda={this._toggleAgenda}
      >
        <EventSearchBar />
      </HeaderControls>
    );
  }
}
