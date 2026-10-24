import MailspringStore from 'mailspring-store';
import { VisibleRange } from 'mailspring-component-kit';

/**
 * The days Week or Day is showing, for the sidebar's mini month to shade; null in Month view.
 * Apart from FocusedMomentStore, whose listeners would take each scroll step for a new focus.
 */
class VisibleRangeStore extends MailspringStore {
  _visibleRange: VisibleRange | null = null;

  visibleRange() {
    return this._visibleRange;
  }

  setVisibleRange(range: VisibleRange | null) {
    const current = this._visibleRange;
    if (range?.first === current?.first && range?.days === current?.days) return;
    this._visibleRange = range;
    this.trigger();
  }
}

export default new VisibleRangeStore();
