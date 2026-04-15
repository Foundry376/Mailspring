/* eslint global-require:0 */

import _ from 'underscore';
import { Utils, localized } from 'mailspring-exports';
import classnames from 'classnames';
import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { DisclosureTriangle } from './disclosure-triangle';
import { DropZone } from './drop-zone';
import { RetinaImg } from './retina-img';
import PropTypes from 'prop-types';
import { IOutlineViewItem } from './outline-view';

/*
 * Enum for counter styles
 * @readonly
 * @enum {string}
 */
const CounterStyles = {
  Default: 'def',
  Alt: 'alt',
};

type OutlineViewItemProps = {
  item: IOutlineViewItem;
  level?: number;
  isFirst?: boolean;
  sectionTitle?: string;
};
type OutlineViewItemState = {
  editing: boolean;
  isDropping: boolean;
  creatingChild: boolean;
};
/*
 * Renders an item that may contain more arbitrarily nested items
 * This component resembles OS X's default OutlineView or Sourcelist
 *
 * An OutlineViewItem behaves like a controlled React component; it controls no
 * state internally. All of the desired state must be passed in through props.
 *
 *
 * OutlineView handles:
 * - Collapsing and uncollapsing
 * - Editing value for item
 * - Deleting item
 * - Selecting the item
 * - Displaying an associated count
 * - Dropping elements
 *
 * @param {object} props - props for OutlineViewItem
 * @param {object} props.item - props for OutlineViewItem
 * @param {string} props.item.id - Unique id for the item.
 * @param {string} props.item.name - Name to display
 * @param {string} props.item.contextMenuLabel - Label to be displayed in context menu
 * @param {string} props.item.className - Extra classes to add to the item
 * @param {string} props.item.iconName - Icon name for icon. See {@link RetinaImg} for further reference.
 * @param {array} props.item.children - Array of children of the same type to be
 * displayed.
 * @param {number} props.item.count - Count to display. If falsy, wont display a
 * count.
 * @param {CounterStyles} props.item.counterStyle - One of the possible
 * CounterStyles
 * @param {string} props.item.inputPlaceholder - Placehodler to use when editing
 * item
 * @param {boolean} props.item.collapsed - Whether the OutlineViewItem is collapsed or
 * not
 * @param {boolean} props.item.editing - Whether the OutlineViewItem is being
 * edited
 * @param {boolean} props.item.selected - Whether the OutlineViewItem is selected
 * @param {props.item.shouldAcceptDrop} props.item.shouldAcceptDrop
 * @param {props.item.onCollapseToggled} props.item.onCollapseToggled
 * @param {props.item.onInputCleared} props.item.onInputCleared
 * @param {props.item.onDrop} props.item.onDrop
 * @param {props.item.onSelect} props.item.onSelect
 * @param {props.item.onDelete} props.item.onDelete
 * @param {props.item.onEdited} props.item.onEdited
 * @class OutlineViewItem
 */
class OutlineViewItem extends Component<OutlineViewItemProps, OutlineViewItemState> {
  static displayName = 'OutlineView';

  /*
   * If provided, this function will be called when receiving a drop. It must
   * return true if it should accept it or false otherwise.
   * @callback props.item.shouldAcceptDrop
   * @param {object} item - The current item
   * @param {object} event - The drag event
   * @return {boolean}
   */
  /*
   * If provided, this function will be called when the action to collapse or
   * uncollapse the OutlineViewItem is executed.
   * @callback props.item.onCollapseToggled
   * @param {object} item - The current item
   */
  /*
   * If provided, this function will be called when the editing input is cleared
   * via Esc key, blurring, or submiting the edit.
   * @callback props.item.onInputCleared
   * @param {object} item - The current item
   * @param {object} event - The associated event
   */
  /*
   * If provided, this function will be called when an element is dropped in the
   * item
   * @callback props.item.onDrop
   * @param {object} item - The current item
   * @param {object} event - The associated event
   */
  /*
   * If provided, this function will be called when the item is selected
   * @callback props.item.onSelect
   * @param {object} item - The current item
   */
  /*
   * If provided, this function will be called when the the delete action is
   * executed
   * @callback props.item.onDelete
   * @param {object} item - The current item
   */
  /*
   * If provided, this function will be called when the item is edited
   * @callback props.item.onEdited
   * @param {object} item - The current item
   * @param {string} value - The new value
   */
  static propTypes = {
    item: PropTypes.shape({
      className: PropTypes.string,
      id: PropTypes.string.isRequired,
      children: PropTypes.array.isRequired,
      name: PropTypes.string.isRequired,
      iconName: PropTypes.string,
      count: PropTypes.number,
      counterStyle: PropTypes.string,
      inputPlaceholder: PropTypes.string,
      collapsed: PropTypes.bool,
      editing: PropTypes.bool,
      selected: PropTypes.bool,
      shouldAcceptDrop: PropTypes.func,
      onCollapseToggled: PropTypes.func,
      onInputCleared: PropTypes.func,
      onDrop: PropTypes.func,
      onSelect: PropTypes.func,
      onDelete: PropTypes.func,
      onEdited: PropTypes.func,
    }).isRequired,
  };

  static CounterStyles = CounterStyles;

  _expandTimeout?: NodeJS.Timeout;

  constructor(props) {
    super(props);
    this.state = {
      isDropping: false,
      editing: props.item.editing || false,
      creatingChild: false,
    };
  }

  componentDidMount() {
    if (this._shouldShowContextMenu()) {
      ReactDOM.findDOMNode(this).addEventListener('contextmenu', this._onShowContextMenu);
    }
  }

  componentDidUpdate(prevProps: OutlineViewItemProps) {
    if (this.props.item.editing && !prevProps.item.editing) {
      this.setState({ editing: this.props.item.editing });
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    clearTimeout(this._expandTimeout);
    if (this._shouldShowContextMenu()) {
      ReactDOM.findDOMNode(this).removeEventListener('contextmenu', this._onShowContextMenu);
    }
  }

  // Helpers

  _runCallback = (method, ...args) => {
    const item = this.props.item;
    if (item[method]) {
      return item[method](item, ...args);
    }
    return undefined;
  };

  _shouldShowContextMenu = () => {
    return (
      this.props.item.onDelete != null ||
      this.props.item.onEdited != null ||
      this.props.item.onExport != null ||
      this.props.item.onCreateChild != null
    );
  };

  _shouldAcceptDrop = event => {
    return this._runCallback('shouldAcceptDrop', event);
  };

  _clearEditingState = event => {
    this.setState({ editing: false });
    this._runCallback('onInputCleared', event);
  };

  // Handlers

  _onDragStateChange = ({ isDropping }) => {
    this.setState({ isDropping });

    const { item } = this.props;
    if (isDropping === true && item.children.length > 0 && item.collapsed) {
      this._expandTimeout = setTimeout(this._onCollapseToggled, 650);
    } else if (isDropping === false && this._expandTimeout) {
      clearTimeout(this._expandTimeout);
      this._expandTimeout = null;
    }
  };

  _onDrop = event => {
    this._runCallback('onDrop', event);
  };

  _onCollapseToggled = () => {
    this._runCallback('onCollapseToggled');
  };

  _onClick = event => {
    event.preventDefault();
    this._runCallback('onSelect');
  };

  _onDelete = () => {
    this._runCallback('onDelete');
  };

  _onEdited = value => {
    this._runCallback('onEdited', value);
  };

  _onEdit = () => {
    if (this.props.item.onEdited) {
      this.setState({ editing: true });
    }
  };

  _onCreateChildTriggered = () => {
    if (this.props.item.collapsed) {
      this._onCollapseToggled();
    }
    this.setState({ creatingChild: true });
  };

  _onChildCreated = (_item, value) => {
    this.setState({ creatingChild: false });
    if (value) {
      this._runCallback('onCreateChild', value);
    }
  };

  _onCreateChildInputCleared = () => {
    this.setState({ creatingChild: false });
  };

  _onInputFocus = event => {
    const input = event.target;
    input.selectionStart = input.selectionEnd = input.value.length;
  };

  _onInputBlur = event => {
    this._clearEditingState(event);
  };

  _onInputKeyDown = event => {
    if (event.key === 'Escape') {
      this._clearEditingState(event);
    }
    if (_.includes(['Enter', 'Return'], event.key)) {
      this._onEdited(event.target.value);
      this._clearEditingState(event);
    }
  };

  _buildContextMenu = () => {
    const item = this.props.item;
    const contextMenuLabel = item.contextMenuLabel || item.name;
    const { Menu, MenuItem } = require('@electron/remote');
    const menu = new Menu();

    if (this.props.item.onEdited) {
      menu.append(
        new MenuItem({
          label: `${localized(`Rename`)} ${contextMenuLabel}`,
          click: this._onEdit,
        })
      );
    }

    if (this.props.item.onDelete) {
      menu.append(
        new MenuItem({
          label: `${localized(`Delete`)} ${contextMenuLabel}`,
          click: this._onDelete,
        })
      );
    }

    if (this.props.item.onCreateChild) {
      const isLabel = contextMenuLabel.toLowerCase() === 'label';
      menu.append(
        new MenuItem({
          label: isLabel ? localized(`New Sublabel...`) : localized(`New Subfolder...`),
          click: this._onCreateChildTriggered,
        })
      );
    }

    if (this.props.item.onExport) {
      menu.append(
        new MenuItem({
          label: localized(`Export folder as .eml files...`),
          click: () => this._runCallback('onExport'),
        })
      );
    }

    return menu;
  };

  _onShowContextMenu = event => {
    event.stopPropagation();
    this._buildContextMenu().popup({});
  };

  _onMenuButtonClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    this._buildContextMenu().popup({});
  };

  // Renderers

  _renderItem(item = this.props.item, state = this.state) {
    const containerClass = classnames({
      item: true,
      selected: item.selected,
      editing: state.editing,
      [item.className]: item.className,
    });

    return (
      <DropZone
        id={item.id}
        className={containerClass}
        onDrop={this._onDrop}
        onClick={this._onClick}
        onDoubleClick={this._onEdit}
        shouldAcceptDrop={this._shouldAcceptDrop}
        onDragStateChange={this._onDragStateChange}
      >
        {item.count > 0 && (
          <div
            className={`item-count-box ${item.counterStyle === CounterStyles.Alt && 'alt-count'}`}
          >
            {item.count}
          </div>
        )}
        {item.iconName && (
          <div className="icon">
            <RetinaImg
              name={item.iconName}
              fallback={'folder.png'}
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </div>
        )}
        {state.editing ? (
          <input
            autoFocus
            type="text"
            tabIndex={0}
            className="item-input"
            placeholder={item.inputPlaceholder || ''}
            defaultValue={item.name}
            onBlur={this._onInputBlur}
            onFocus={this._onInputFocus}
            onKeyDown={this._onInputKeyDown}
          />
        ) : (
          <div className="name" title={item.name}>
            {item.name}
          </div>
        )}
        {this._shouldShowContextMenu() && !state.editing && this.props.item.onEdited && (
          <div
            className="item-action-button"
            role="button"
            tabIndex={-1}
            aria-label={localized('Actions')}
            onClick={this._onMenuButtonClick}
          >
            •••
          </div>
        )}
      </DropZone>
    );
  }

  _renderCreateChildInput() {
    const isLabel = (this.props.item.contextMenuLabel || '').toLowerCase() === 'label';
    const item = {
      id: `create-child-${this.props.item.id}`,
      name: '',
      children: [],
      editing: true,
      iconName: this.props.item.iconName || 'folder.png',
      onEdited: this._onChildCreated,
      inputPlaceholder: isLabel ? localized('Sublabel name') : localized('Subfolder name'),
      onInputCleared: this._onCreateChildInputCleared,
    };
    return <OutlineViewItem item={item} level={(this.props.level || 1) + 1} />;
  }

  _renderChildren(item = this.props.item) {
    const showRegularChildren = item.children.length > 0 && !item.collapsed;
    const showCreateChildInput = this.state.creatingChild;

    if (showRegularChildren || showCreateChildInput) {
      const childLevel = (this.props.level || 1) + 1;
      return (
        <div role="group" className="item-children" key={`${item.id}-children`}>
          {showCreateChildInput && this._renderCreateChildInput()}
          {showRegularChildren &&
            item.children.map(child => (
              <OutlineViewItem key={child.id} item={child} level={childLevel} />
            ))}
        </div>
      );
    }
    return <span />;
  }

  render() {
    const item = this.props.item;
    const hasChildren = item.children.length > 0;
    const showAsExpanded = this.state.creatingChild;
    const containerClasses = classnames({
      'item-container': true,
      dropping: this.state.isDropping,
    });
    return (
      <div
        role="treeitem"
        aria-level={this.props.level || 1}
        aria-selected={item.selected || false}
        aria-expanded={
          hasChildren || showAsExpanded ? !(item.collapsed && !showAsExpanded) : undefined
        }
        aria-label={
          this.props.sectionTitle ? `${this.props.sectionTitle}, ${item.name}` : item.name
        }
        tabIndex={item.selected || this.props.isFirst ? 0 : -1}
      >
        <span className={containerClasses}>
          <DisclosureTriangle
            collapsed={item.collapsed && !showAsExpanded}
            visible={hasChildren || showAsExpanded}
            onCollapseToggled={this._onCollapseToggled}
          />
          {this._renderItem()}
        </span>
        {this._renderChildren()}
      </div>
    );
  }
}

export default OutlineViewItem;
