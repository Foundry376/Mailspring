import { MultiselectListProps } from './multiselect-list';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
export default class MultiselectSplitInteractionHandler {
  props: MultiselectListProps;
  onFocusItem: (item: any) => void;
  onSetCursorPosition: (item: any) => void;

  constructor(props: MultiselectListProps) {
    this.props = props;
    this.onFocusItem = props.onFocusItem;
    this.onSetCursorPosition = props.onSetCursorPosition;
  }

  cssClass() {
    return 'handler-split';
  }

  shouldShowFocus() {
    return true;
  }

  shouldShowCheckmarks() {
    return false;
  }

  shouldShowKeyboardCursor() {
    return this.props.dataSource.selection.count() > 1;
  }

  onClick = item => {
    this.onFocusItem(item);
    this.props.dataSource.selection.clear();
    this._checkSelectionAndFocusConsistency();
  };

  onMetaClick = item => {
    this._turnFocusIntoSelection();
    this.props.dataSource.selection.toggle(item);
    this._checkSelectionAndFocusConsistency();
  };

  onShiftClick = item => {
    this._turnFocusIntoSelection();
    this.props.dataSource.selection.expandTo(item);
    this._checkSelectionAndFocusConsistency();
  };

  onEnter = () => {};
  // This concept does not exist in split mode

  onDeselect = () => {
    this.props.dataSource.selection.clear();
    this._checkSelectionAndFocusConsistency();
  };

  onSelect = items => {
    this.props.dataSource.selection.set(items);
    this._checkSelectionAndFocusConsistency();
  };

  onSelectKeyboardItem = () => {
    this._checkSelectionAndFocusConsistency();
  };

  onShift = (delta, options) => {
    if (options.select) {
      this._turnFocusIntoSelection();
    }

    let action, id;
    if (this.props.dataSource.selection.count() > 0) {
      const keyboardId = this.props.keyboardCursorId;
      id = keyboardId != null ? keyboardId : this.props.dataSource.selection.top().id;
      action = this.onSetCursorPosition;
    } else {
      id = this.props.focusedId;
      action = this.onFocusItem;
    }

    const current = this.props.dataSource.getById(id);
    let index = this.props.dataSource.indexOfId(id);
    index = Math.max(0, Math.min(index + delta, this.props.dataSource.count() - 1));
    const next = this.props.dataSource.get(index);

    action(next);
    if (options.select) {
      this.props.dataSource.selection.walk({ current, next });
    }

    this._checkSelectionAndFocusConsistency();
  };

  _turnFocusIntoSelection() {
    const { focused } = this.props as any;
    this.onFocusItem(null);
    this.props.dataSource.selection.add(focused);
  }

  _checkSelectionAndFocusConsistency() {
    const { focused } = this.props as any;
    const { selection } = this.props.dataSource;

    if (focused && selection.count() > 0) {
      this.props.dataSource.selection.add(focused);
      this.onFocusItem(null);
    }

    if (selection.count() === 1 && !focused) {
      this.onFocusItem(selection.items()[0]);
      this.props.dataSource.selection.clear();
    }
  }
}
