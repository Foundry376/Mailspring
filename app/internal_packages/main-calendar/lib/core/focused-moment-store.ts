import MailspringStore from 'mailspring-store';
import moment, { Moment } from 'moment';
import { FocusedEventInfo } from './calendar-data-source';

/**
 * The date the calendar is showing, shared by the sidebar's mini month and the grid, which sit in
 * separate sheet columns. Being a module singleton, it also keeps the date while the main window
 * shows Mail, until the app restarts.
 */
class FocusedMomentStore extends MailspringStore {
  _focusedMoment: Moment = moment();
  _focusedEvent: FocusedEventInfo | null = null;

  focusedMoment() {
    return this._focusedMoment;
  }

  /** The event to scroll to and flash, if the date was set to reveal one. */
  focusedEvent() {
    return this._focusedEvent;
  }

  setFocusedMoment(focusedMoment: Moment, focusedEvent: FocusedEventInfo | null = null) {
    this._focusedMoment = focusedMoment;
    this._focusedEvent = focusedEvent;
    this.trigger();
  }
}

export default new FocusedMomentStore();
