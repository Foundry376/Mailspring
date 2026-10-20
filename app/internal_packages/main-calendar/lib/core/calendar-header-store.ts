import MailspringStore from 'mailspring-store';
import { CalendarView } from './calendar-constants';

export interface ViewHeader {
  title: string;
  arrows: 'horizontal' | 'vertical';
  prevAction: () => void;
  nextAction: () => void;
  todayAction: () => void;
}

export interface CalendarControls {
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
}

/** Triggers only when something drawn changes; the actions are kept current without a redraw. */
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
