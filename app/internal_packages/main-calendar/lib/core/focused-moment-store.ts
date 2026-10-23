import MailspringStore from 'mailspring-store';
import moment, { Moment } from 'moment';
import { FocusedEventInfo } from './calendar-data-source';

/** A module singleton, so the viewed date survives the grid unmounting while Mail shows. */
class FocusedMomentStore extends MailspringStore {
  // Unset until the user picks a date, so a calendar first opened days after launch shows today.
  _focusedMoment: Moment | null = null;
  _focusedEvent: FocusedEventInfo | null = null;

  focusedMoment() {
    return this._focusedMoment || moment();
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
