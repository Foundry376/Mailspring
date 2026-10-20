import React from 'react';
import { HeaderControls } from './header-controls';
import CalendarHeaderStore from './calendar-header-store';
import { CalendarView } from './calendar-constants';

/** The calendar's header, in the window toolbar above the grid. */
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
  _prev = () => CalendarHeaderStore.viewHeader()?.prevAction();
  _next = () => CalendarHeaderStore.viewHeader()?.nextAction();
  _today = () => CalendarHeaderStore.viewHeader()?.todayAction();
  _changeView = (view: CalendarView) => CalendarHeaderStore.controls()?.onChangeView(view);
  _toggleAgenda = () => CalendarHeaderStore.controls()?.onToggleAgenda();

  render() {
    const viewHeader = CalendarHeaderStore.viewHeader();
    const controls = CalendarHeaderStore.controls();
    if (!viewHeader || !controls) {
      return null;
    }
    return (
      <HeaderControls
        title={viewHeader.title}
        arrows={viewHeader.arrows}
        view={controls.view}
        agendaOpen={controls.agendaOpen}
        prevAction={this._prev}
        nextAction={this._next}
        todayAction={this._today}
        onChangeView={this._changeView}
        onToggleAgenda={this._toggleAgenda}
      />
    );
  }
}
