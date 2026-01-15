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
import { CommandCallback } from '../registries/command-registry';

export interface MultiselectListProps extends ListTabularProps {
  focused?: any;
  focusedId?: string;
  keyboardCursorId?: string;
  dataSource?: ListDataSource;
  className: string;
  columns: ListTabularColumn[];
  itemPropsProvider: (...args: any[]) => any;
  keymapHandlers?: {
    [command: string]: CommandCallback;
  };
  onFocusItem?: (item: any) => void;
  onDragItems?: (event: React.DragEvent, items: any) => void;
  onSetCursorPosition?: (item: any) => void;
  onComponentDidUpdate?: (...args: any[]) => any;
}

type MultiselectListState = {
  computedColumns: ListTabularColumn[];
  layoutMode: string;
  // Private state for memoization
  _checkmarkColumn: ListTabularColumn;
  _lastColumns: ListTabularColumn[];
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

  private listRef = React.createRef<ListTabular>();
  private unsubscribers: (() => void)[] = [];

  constructor(props) {
    super(props);
    const checkmarkColumn = this._createCheckmarkColumn();
    const layoutMode = WorkspaceStore.layoutMode();

    // Compute initial columns
    const computedColumns = this._computeColumns(props.columns, layoutMode, checkmarkColumn);

    this.state = {
      computedColumns,
      layoutMode,
      _checkmarkColumn: checkmarkColumn,
      _lastColumns: props.columns,
    };
  }

  static getDerivedStateFromProps(
    props: MultiselectListProps,
    state: MultiselectListState
  ): Partial<MultiselectListState> | null {
    if (!state?._checkmarkColumn) {
      return null;
    }

    const layoutMode = WorkspaceStore.layoutMode();
    const columnsChanged = props.columns !== state._lastColumns;
    const layoutModeChanged = layoutMode !== state.layoutMode;

    // Only recompute columns if columns or layout mode actually changed
    if (columnsChanged || layoutModeChanged) {
      const computedColumns = [...props.columns];
      if (layoutMode === 'list') {
        computedColumns.splice(0, 0, state._checkmarkColumn);
      }
      return {
        computedColumns,
        layoutMode,
        _lastColumns: props.columns,
      };
    }

    // Update layoutMode even if columns didn't change
    if (layoutModeChanged) {
      return { layoutMode };
    }

    return null;
  }

  componentDidMount() {
    this.unsubscribers = [WorkspaceStore.listen(this._onWorkspaceChange)];
  }

  componentDidUpdate(prevProps: MultiselectListProps) {
    if (this.props.onComponentDidUpdate) {
      this.props.onComponentDidUpdate();
    }

    // Scroll to focused/cursor item when it changes
    if (
      prevProps.focusedId !== this.props.focusedId ||
      prevProps.keyboardCursorId !== this.props.keyboardCursorId
    ) {
      const list = this.listRef.current;
      if (list) {
        const el = ReactDOM.findDOMNode(list) as HTMLElement;
        const item = el?.querySelector('.focused') || el?.querySelector('.keyboard-cursor');
        if (item instanceof HTMLElement) {
          list.scrollTo(item);
        }
      }
    }
  }

  componentWillUnmount() {
    this.unsubscribers.forEach(unsub => unsub());
  }

  /**
   * Creates the appropriate interaction handler for the current layout mode.
   * Called fresh each time to ensure handler always has current props.
   */
  private _getHandler() {
    if (this.state.layoutMode === 'list') {
      return new MultiselectListInteractionHandler(this.props);
    } else {
      return new MultiselectSplitInteractionHandler(this.props);
    }
  }

  private _computeColumns(
    columns: ListTabularColumn[],
    layoutMode: string,
    checkmarkColumn: ListTabularColumn
  ): ListTabularColumn[] {
    const computed = [...columns];
    if (layoutMode === 'list') {
      computed.splice(0, 0, checkmarkColumn);
    }
    return computed;
  }

  private _globalKeymapHandlers() {
    return {
      ...this.props.keymapHandlers,
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
    };
  }

  private _getItemPropsProvider() {
    return (item: any, idx: number) => {
      const handler = this._getHandler();
      const selectedIds = this.props.dataSource.selection.ids();
      const selected = selectedIds.includes(item.id);

      let nextSelected = false;
      if (!selected) {
        const next = this.props.dataSource.get(idx + 1);
        nextSelected = next ? selectedIds.includes(next.id) : false;
      }

      const props = this.props.itemPropsProvider(item, idx);
      props.className =
        (props.className || '') +
        ' ' +
        classNames({
          selected,
          'next-is-selected': !selected && nextSelected,
          focused: handler.shouldShowFocus() && item.id === this.props.focusedId,
          'keyboard-cursor':
            handler.shouldShowKeyboardCursor() && item.id === this.props.keyboardCursorId,
        });
      props['data-item-id'] = item.id;
      return props;
    };
  }

  render() {
    const otherProps = Utils.fastOmit(this.props, Object.keys(MultiselectList.propTypes));
    let { className } = this.props;

    if (this.props.dataSource) {
      const handler = this._getHandler();
      className += ` ${handler.cssClass()}`;

      return (
        <KeyCommandsRegion globalHandlers={this._globalKeymapHandlers()} className={className}>
          <ListTabular
            ref={this.listRef}
            columns={this.state.computedColumns}
            dataSource={this.props.dataSource}
            itemPropsProvider={this._getItemPropsProvider()}
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

  // Event Handlers

  private _onDragStart = (event: React.DragEvent) => {
    if (!this.props.onDragItems) {
      event.preventDefault();
      return;
    }

    const items = this.itemsForMouseEvent(event);
    if (!items || items.length === 0) {
      event.preventDefault();
      return;
    }
    this.props.onDragItems(event, items);
  };

  private _onClickItem = (item: any, event: React.MouseEvent) => {
    const handler = this._getHandler();
    if (event.metaKey || event.ctrlKey) {
      handler.onMetaClick(item);
    } else if (event.shiftKey) {
      handler.onShiftClick(item);
    } else {
      handler.onClick(item);
    }
  };

  private _onEnter = () => {
    this._getHandler().onEnter();
  };

  private _onSelectKeyboardItem = () => {
    this._getHandler().onSelectKeyboardItem();
  };

  private _onSelectAll = () => {
    const items = this.props.dataSource.itemsCurrentlyInViewMatching(() => true);
    this._getHandler().onSelect(items);
  };

  private _onDeselect = () => {
    if (!this._isVisible()) {
      return;
    }
    this._getHandler().onDeselect();
  };

  private _onShift = (delta: number, options: { select?: boolean } = {}) => {
    this._getHandler().onShift(delta, options);
  };

  private _onScrollByPage = (delta: number) => {
    this.listRef.current?.scrollByPage(delta);
  };

  private _onWorkspaceChange = () => {
    // Trigger re-render to check for layout mode changes
    this.forceUpdate();
  };

  private _isVisible = () => {
    if (this.state.layoutMode) {
      return WorkspaceStore.topSheet().root;
    }
    return true;
  };

  private _createCheckmarkColumn(): ListTabularColumn {
    return new ListTabularColumn({
      name: 'Check',
      resolver: (item: any) => {
        const toggle = (event: React.MouseEvent) => {
          const handler = this._getHandler();
          if (event.shiftKey) {
            handler.onShiftClick(item);
          } else {
            handler.onMetaClick(item);
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
  }

  // Public Methods

  handler() {
    return this._getHandler();
  }

  itemIdAtPoint(x: number, y: number): string | null {
    const item = document.elementFromPoint(x, y)?.closest('[data-item-id]') as HTMLElement;
    return item?.dataset.itemId || null;
  }

  itemsForMouseEvent(event: { clientX: number; clientY: number }) {
    const { dataSource } = this.props;
    const itemId = this.itemIdAtPoint(event.clientX, event.clientY);

    if (!itemId) {
      return [];
    }

    if (dataSource.selection.ids().includes(itemId)) {
      return dataSource.selection.items();
    }

    const item = dataSource.getById(itemId);
    return item ? [item] : [];
  }
}
