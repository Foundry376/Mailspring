import MailspringStore from 'mailspring-store';
import { CalendarView } from './calendar-constants';

/** What the view showing puts in the header: its title, and how its arrows and Today move it. */
export interface ViewHeader {
  title: string;
  arrows: 'horizontal' | 'vertical';
  prevAction: () => void;
  nextAction: () => void;
  todayAction: () => void;
}

/** The header's controls that belong to the calendar rather than to one view. */
export interface CalendarControls {
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
}

/**
 * The header sits in the window's toolbar, outside the calendar, so the calendar and its views
 * hand it what to show here. Triggers only when something drawn changes; the actions are kept
 * current without a redraw.
 */
class CalendarHeaderStore extends MailspringStore {
  _viewHeader: ViewHeader | null = null;
  _controls: CalendarControls | null = null;

  viewHeader() {
    return this._viewHeader;
  }

  controls() {
    return this._controls;
  }

  setViewHeader(viewHeader: ViewHeader | null) {
    const shown = this._viewHeader;
    this._viewHeader = viewHeader;
    if (shown?.title !== viewHeader?.title || shown?.arrows !== viewHeader?.arrows) {
      this.trigger();
    }
  }

  setControls(controls: CalendarControls | null) {
    const shown = this._controls;
    this._controls = controls;
    if (shown?.view !== controls?.view || shown?.agendaOpen !== controls?.agendaOpen) {
      this.trigger();
    }
  }
}

export default new CalendarHeaderStore();
