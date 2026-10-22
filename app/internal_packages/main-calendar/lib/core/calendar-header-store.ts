import MailspringStore from 'mailspring-store';
import { CalendarView } from './calendar-constants';

export interface ViewNavigation {
  arrows: 'horizontal' | 'vertical';
  prevAction: () => void;
  nextAction: () => void;
  todayAction: () => void;
}

export interface CalendarOptions {
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
}

/** Triggers only when something drawn changes; the actions are kept current without a redraw. */
class CalendarHeaderStore extends MailspringStore {
  _viewNavigation: ViewNavigation | null = null;
  _calendarOptions: CalendarOptions | null = null;

  viewNavigation() {
    return this._viewNavigation;
  }

  calendarOptions() {
    return this._calendarOptions;
  }

  setViewNavigation(navigation: ViewNavigation | null) {
    const shown = this._viewNavigation;
    this._viewNavigation = navigation;
    if (shown?.arrows !== navigation?.arrows) {
      this.trigger();
    }
  }

  setCalendarOptions(options: CalendarOptions | null) {
    const shown = this._calendarOptions;
    this._calendarOptions = options;
    if (shown?.view !== options?.view || shown?.agendaOpen !== options?.agendaOpen) {
      this.trigger();
    }
  }
}

export default new CalendarHeaderStore();
