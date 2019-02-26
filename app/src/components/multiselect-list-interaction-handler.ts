/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { WorkspaceStore } = require('mailspring-exports');

module.exports = class MultiselectListInteractionHandler {
  constructor(props) {
    this.props = props;
    this.onFocusItem = props.onFocusItem;
    this.onSetCursorPosition = props.onSetCursorPosition;
  }

  cssClass() {
    return 'handler-list';
  }

  shouldShowFocus() {
    return false;
  }

  shouldShowCheckmarks() {
    return true;
  }

  shouldShowKeyboardCursor() {
    return true;
  }

  onClick = item => {
    this.onFocusItem(item);
  };

  onMetaClick = item => {
    this.props.dataSource.selection.toggle(item);
    this.onSetCursorPosition(item);
  };

  onShiftClick = item => {
    this.props.dataSource.selection.expandTo(item);
    this.onSetCursorPosition(item);
  };

  onEnter = () => {
    const { keyboardCursorId } = this.props;
    if (keyboardCursorId) {
      const item = this.props.dataSource.getById(keyboardCursorId);
      this.onFocusItem(item);
    }
  };

  onDeselect = () => {
    this.props.dataSource.selection.clear();
  };

  onSelect = items => {
    this.props.dataSource.selection.set(items);
  };

  onSelectKeyboardItem = () => {
    const { id } = this._keyboardContext();
    if (!id) {
      return;
    }
    this.props.dataSource.selection.toggle(this.props.dataSource.getById(id));
  };

  onShift = (delta, options = {}) => {
    const { id, action } = this._keyboardContext();

    const current = this.props.dataSource.getById(id);
    let index = this.props.dataSource.indexOfId(id);
    index = Math.max(0, Math.min(index + delta, this.props.dataSource.count() - 1));
    const next = this.props.dataSource.get(index);

    action(next);
    if (options.select) {
      this.props.dataSource.selection.walk({ current, next });
    }
  };

  _keyboardContext = () => {
    if (WorkspaceStore.topSheet().root) {
      return { id: this.props.keyboardCursorId, action: this.onSetCursorPosition };
    } else {
      return { id: this.props.focusedId, action: this.onFocusItem };
    }
  };
};
