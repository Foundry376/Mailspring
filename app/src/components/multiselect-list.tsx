import _ from 'underscore';
import classNames from 'classnames';
import { ListTabular, ListTabularProps, ListTabularColumn } from './list-tabular';
import { Spinner } from './spinner';
import React from 'react';
import ReactDOM from 'react-dom';
import { PropTypes, Utils, WorkspaceStore } from 'mailspring-exports';
import { KeyCommandsRegion } from 'mailspring-component-kit';

import MultiselectListInteractionHandler from './multiselect-list-interaction-handler';
import MultiselectSplitInteractionHandler from './multiselect-split-interaction-handler';
import { ListDataSource } from './list-data-source';

export interface MultiselectListProps extends ListTabularProps {
  focusedId?: string;
  keyboardCursorId?: string;
  dataSource?: ListDataSource;
  className: string;
  columns: ListTabularColumn[];
  itemPropsProvider: (...args: any[]) => any;
  keymapHandlers?: object;
  onFocusItem?: (item: any) => void;
  onDragItems?: (event: React.DragEvent, items: any) => void;
  onSetCursorPosition?: (item: any) => void;
  onComponentDidUpdate?: (...args: any[]) => any;
}

type MultiselectListState = {
  handler: any;
  columns: ListTabularColumn[];
  computedColumns: ListTabularColumn[];
  layoutMode: string;
};
/*
Public: MultiselectList wraps {ListTabular} and makes it easy to present a
{ListDataSource} with selection support. It adds a checkbox column to the columns
you provide, and also handles:

- Command-clicking individual items
- Shift-clicking to select a range
- Using the keyboard to select a range

Section: Component Kit
*/
export class MultiselectList extends React.Component<MultiselectListProps, MultiselectListState> {
  static displayName = 'MultiselectList';

  static propTypes = {
    dataSource: PropTypes.object,
    className: PropTypes.string.isRequired,
    columns: PropTypes.array.isRequired,
    itemPropsProvider: PropTypes.func.isRequired,
    keymapHandlers: PropTypes.object,
    onComponentDidUpdate: PropTypes.func,
  };

  unsubscribers: (() => void)[];
  itemPropsProvider: (item: any, idx: number) => object;
  refs: {
    list: ListTabular;
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
      const el = ReactDOM.findDOMNode(this) as HTMLElement;
      const item = el.querySelector('.focused') || el.querySelector('.keyboard-cursor');
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
    const otherProps = Utils.fastOmit(this.props, Object.keys(MultiselectList.propTypes));

    let { className } = this.props;
    if (this.props.dataSource && this.state.handler) {
      className += ` ${this.state.handler.cssClass()}`;

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
          props.className +=
            ' ' +
            classNames({
              selected: selected,
              'next-is-selected': !selected && nextSelected,
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
            onDragStart={this._onDragStart}
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

  _onDragStart = event => {
    if (!this.props.onDragItems) {
      event.preventDefault();
      return null;
    }

    const items = this.itemsForMouseEvent(event);
    if (!items) {
      event.preventDefault();
      return null;
    }
    this.props.onDragItems(event, items);
  };

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
    return new ListTabularColumn({
      name: 'Check',
      resolver: item => {
        const toggle = event => {
          if (event.shiftKey) {
            this.state.handler.onShiftClick(item);
          } else {
            this.state.handler.onMetaClick(item);
          }
          event.stopPropagation();
        };
        return (
          <div className="checkmark" onClick={toggle}>
            <div className="inner" />
          </div>
        );
      },
    });
  };

  _getStateFromStores(props = this.props) {
    let computedColumns, handler;
    const state: Partial<MultiselectListState> = this.state || {};

    const layoutMode = WorkspaceStore.layoutMode();

    // Do we need to re-compute columns? Don't do this unless we really have to,
    // it will cause a re-render of the entire ListTabular. To know whether our
    // computed columns are still valid, we store the original columns in our state
    // along with the computed ones.
    if (props.columns !== state.columns || layoutMode !== state.layoutMode) {
      computedColumns = [...props.columns];
      if (layoutMode === 'list') {
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
    const item = document.elementFromPoint(x, y).closest('[data-item-id]') as HTMLElement;
    if (!item) {
      return null;
    }
    return item.dataset.itemId;
  }

  itemsForMouseEvent(event) {
    const { dataSource, onDragItems } = this.props;

    const itemId = this.itemIdAtPoint(event.clientX, event.clientY);
    if (!itemId) return [];

    if (itemId && dataSource.selection.ids().includes(itemId)) {
      return dataSource.selection.items();
    } else {
      const item = dataSource.getById(itemId);
      if (!item) return [];
      return [item];
    }
  }
}
