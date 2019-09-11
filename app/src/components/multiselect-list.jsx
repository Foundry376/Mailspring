const _ = require('underscore');
const classNames = require('classnames');
const ListTabular = require('./list-tabular').default;
const Spinner = require('./spinner');
const { React, ReactDOM, PropTypes, Utils, WorkspaceStore } = require('mailspring-exports');
const { KeyCommandsRegion } = require('mailspring-component-kit');

const MultiselectListInteractionHandler = require('./multiselect-list-interaction-handler');
const MultiselectSplitInteractionHandler = require('./multiselect-split-interaction-handler');

/*
Public: MultiselectList wraps {ListTabular} and makes it easy to present a
{ListDataSource} with selection support. It adds a checkbox column to the columns
you provide, and also handles:

- Command-clicking individual items
- Shift-clicking to select a range
- Using the keyboard to select a range

Section: Component Kit
*/
class MultiselectList extends React.Component {
  static displayName = 'MultiselectList';

  static propTypes = {
    dataSource: PropTypes.object,
    className: PropTypes.string.isRequired,
    columns: PropTypes.array.isRequired,
    columnCheckProvider: PropTypes.func,
    itemPropsProvider: PropTypes.func.isRequired,
    keymapHandlers: PropTypes.object,
    onComponentDidUpdate: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.setupForProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    if (_.isEqual(this.props, newProps)) {
      return;
    }
    this.teardownForProps();
    this.setupForProps(newProps);
    this.setState(this._getStateFromStores(newProps));
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.onComponentDidUpdate) {
      this.props.onComponentDidUpdate();
    }
    if (
      prevProps.focusedId !== this.props.focusedId ||
      prevProps.keyboardCursorId !== this.props.keyboardCursorId
    ) {
      const item =
        ReactDOM.findDOMNode(this).querySelector('.focused') ||
        ReactDOM.findDOMNode(this).querySelector('.keyboard-cursor');
      if (!(item instanceof Node)) {
        return;
      }
      this.refs.list.scrollTo(item);
    }
  }

  componentWillUnmount() {
    this.teardownForProps();
  }

  teardownForProps() {
    if (!this.unsubscribers) {
      return;
    }
    this.unsubscribers.map(unsubscribe => unsubscribe());
  }

  setupForProps(props) {
    this.unsubscribers = [];
    this.unsubscribers.push(WorkspaceStore.listen(this._onChange));
  }

  _globalKeymapHandlers() {
    return Object.assign({}, this.props.keymapHandlers, {
      'core:focus-item': () => this._onEnter(),
      'core:select-item': () => this._onSelectKeyboardItem(),
      'core:next-item': () => this._onShift(1),
      'core:previous-item': () => this._onShift(-1),
      'core:select-down': () => this._onShift(1, { select: true }),
      'core:select-up': () => this._onShift(-1, { select: true }),
      'core:list-page-up': () => this._onScrollByPage(-1),
      'core:list-page-down': () => this._onScrollByPage(1),
      'core:pop-sheet': () => this._onDeselect(),
      'multiselect-list:select-all': () => this._onSelectAll(),
      'multiselect-list:deselect-all': () => this._onDeselect(),
    });
  }

  render() {
    // IMPORTANT: DO NOT pass inline functions as props. _.isEqual thinks these
    // are "different", and will re-render everything. Instead, declare them with ?=,
    // pass a reference. (Alternatively, ignore these in children's shouldComponentUpdate.)
    //
    // BAD:   onSelect={ (item) -> Actions.focusThread(item) }
    // GOOD:  onSelect={this._onSelectItem}
    //
    const otherProps = Utils.fastOmit(this.props, Object.keys(this.constructor.propTypes));

    let { className } = this.props;
    if (this.props.dataSource && this.state.handler) {
      className += ` ${this.state.handler.cssClass()}`;
      const selectedIds = this.props.dataSource.selection.ids();
      if (selectedIds.length > 0) {
        className += ` show-checkbox`;
      }

      if (this.itemPropsProvider == null) {
        this.itemPropsProvider = (item, idx) => {
          let nextSelected;
          const selectedIds = this.props.dataSource.selection.ids();
          const selected = selectedIds.includes(item.id);
          if (!selected) {
            const next = this.props.dataSource.get(idx + 1);
            const nextId = next && next.id;
            nextSelected = selectedIds.includes(nextId);
          }

          const props = this.props.itemPropsProvider(item, idx);
          if (props.className == null) {
            props.className = '';
          }

          // sometimes selected is focused too, so we need to check this as well
          let nextFocused;
          const focused = this.state.handler.shouldShowFocus() && item.id === this.props.focusedId;
          if (!focused) {
            const next = this.props.dataSource.get(idx + 1);
            const nextId = next && next.id;
            nextFocused = this.state.handler.shouldShowFocus() && nextId === this.props.focusedId;
          }

          props.className +=
            ' ' +
            classNames({
              selected: selected,
              'next-is-selected': (!selected && nextSelected) || (!focused && nextFocused),
              focused: this.state.handler.shouldShowFocus() && item.id === this.props.focusedId,
              'keyboard-cursor':
                this.state.handler.shouldShowKeyboardCursor() &&
                item.id === this.props.keyboardCursorId,
            });
          props['data-item-id'] = item.id;
          return props;
        };
      }

      return (
        <KeyCommandsRegion globalHandlers={this._globalKeymapHandlers()} className={className}>
          <ListTabular
            ref="list"
            columns={this.state.computedColumns}
            dataSource={this.props.dataSource}
            itemPropsProvider={this.itemPropsProvider}
            onSelect={this._onClickItem}
            onComponentDidUpdate={this.props.onComponentDidUpdate}
            {...otherProps}
          />
        </KeyCommandsRegion>
      );
    } else {
      return (
        <div className={className} {...otherProps}>
          <Spinner visible={true} />
        </div>
      );
    }
  }

  _onClickItem = (item, event) => {
    if (!this.state.handler) {
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      this.state.handler.onMetaClick(item);
    } else if (event.shiftKey) {
      this.state.handler.onShiftClick(item);
    } else {
      this.state.handler.onClick(item);
    }
  };

  _onEnter = () => {
    if (!this.state.handler) {
      return;
    }
    this.state.handler.onEnter();
  };

  _onSelectKeyboardItem = () => {
    if (!this.state.handler) {
      return;
    }
    this.state.handler.onSelectKeyboardItem();
  };

  _onSelectAll = () => {
    if (!this.state.handler) {
      return;
    }
    const items = this.props.dataSource.itemsCurrentlyInViewMatching(() => true);
    this.state.handler.onSelect(items);
  };

  _onDeselect = () => {
    if (!this._visible() || !this.state.handler) {
      return;
    }
    this.state.handler.onDeselect();
  };

  _onShift = (delta, options = {}) => {
    if (!this.state.handler) {
      return;
    }
    this.state.handler.onShift(delta, options);
  };

  _onScrollByPage = delta => {
    this.refs.list.scrollByPage(delta);
  };

  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _visible = () => {
    if (this.state.layoutMode) {
      return WorkspaceStore.topSheet().root;
    } else {
      return true;
    }
  };

  _getCheckmarkColumn = () => {
    return new ListTabular.Column({
      name: 'Check',
      resolver: item => {
        const toggle = event => {
          this.state.handler.onCheckMarkClick(item);
          if(event && event.stopPropagation){
            event.stopPropagation();
          }
        };
        if (this.props.columnCheckProvider) {
          return this.props.columnCheckProvider(item, toggle);
        } else {
          return (
            <div className="checkmark" onClick={toggle}>
              <div className="inner"/>
            </div>
          );
        }
      },
    });
  };

  _getStateFromStores(props = this.props) {
    let computedColumns, handler;
    const state = this.state || {};

    const layoutMode = WorkspaceStore.layoutMode();

    // Do we need to re-compute columns? Don't do this unless we really have to,
    // it will cause a re-render of the entire ListTabular. To know whether our
    // computed columns are still valid, we store the original columns in our state
    // along with the computed ones.
    if (props.columns !== state.columns || layoutMode !== state.layoutMode) {
      computedColumns = [].concat(props.columns);
      if (layoutMode === 'list') {
        computedColumns.splice(0, 0, this._getCheckmarkColumn());
      } else if (layoutMode === 'split') {
        computedColumns.splice(0, 0, this._getCheckmarkColumn());
      }
    } else {
      ({ computedColumns } = state);
    }

    if (layoutMode === 'list') {
      handler = new MultiselectListInteractionHandler(props);
    } else {
      handler = new MultiselectSplitInteractionHandler(props);
    }

    return {
      handler,
      columns: props.columns,
      computedColumns,
      layoutMode,
    };
  }

  // Public Methods

  handler() {
    return this.state.handler;
  }

  itemIdAtPoint(x, y) {
    const item = document.elementFromPoint(x, y).closest('[data-item-id]');
    if (!item) {
      return null;
    }
    return item.dataset.itemId;
  }
}

module.exports = MultiselectList;
