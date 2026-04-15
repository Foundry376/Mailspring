import { Utils, localized } from 'mailspring-exports';
import React, { Component, CSSProperties } from 'react';
import { DropZone } from './drop-zone';
import { RetinaImg } from './retina-img';
import OutlineViewItem from './outline-view-item';
import PropTypes from 'prop-types';

export interface IOutlineViewItem {
  id?: string;
  title?: string;
  iconName?: string;
  name?: string;
  children?: IOutlineViewItem[];
  contextMenuLabel?: string;
  collapsed?: boolean;
  className?: string;
  count?: number;
  counterStyle?: string;
  inputPlaceholder?: string;
  editing?: boolean;
  selected?: boolean;
  onItemCreated?: (...args: any[]) => any;
  onCollapseToggled?: (...args: any[]) => any;
  shouldAcceptDrop?: (...args: any[]) => any;
  onInputCleared?: (...args: any[]) => any;
  onDrop?: (...args: any[]) => any;
  onSelect?: (...args: any[]) => any;
  onDelete?: (...args: any[]) => any;
  onEdited?: (...args: any[]) => any;
  onExport?: (...args: any[]) => any;
  onCreateChild?: (...args: any[]) => any;
}

interface OutlineViewProps {
  title: string;
  items: IOutlineViewItem[];
  iconName?: string;
  collapsed?: boolean;
  titleColor?: string;
  onCollapseToggled?: (props: OutlineViewProps) => void;
  onItemCreated?: (displayName) => void;
}

interface OutlineViewState {
  showCreateInput: boolean;
}

/*
 * Renders a section that contains a list of {@link OutlineViewItem}s. These items can
 * be arbitrarily nested. See docs for {@link OutlineViewItem}.
 * An OutlineView behaves like a controlled React component, with callbacks for
 * collapsing and creating items, and respective props for their value. Is it up
 * to the parent component to determine the state of the OutlineView.
 *
 * This component resembles OS X's default OutlineView or Sourcelist
 *
 * OutlineView supports:
 * - Collapsing and uncollapsing
 * - Adding new items to the outline view
 *
 * @param {object} props - props for OutlineView
 * @param {string} props.title - Title to display
 * @param {string} props.iconName - Icon name to use when displaying input to
 * add a new item. See {@link RetinaImg} for further reference.
 * @param {array} props.items - Array of strings or numbers to display as {@link
 * OutlineViewItem}s
 * @param {boolean} props.collapsed - Whether the OutlineView is collapsed or
 * not
 * @param {string} props.titleColor - Colored bar that is displayed to highlight the title
 * @param {props.onItemCreated} props.onItemCreated
 * @param {props.onCollapseToggled} props.onCollapseToggled
 * @class OutlineView
 */
export class OutlineView extends Component<OutlineViewProps, OutlineViewState> {
  static displayName = 'OutlineView';

  /*
   * If provided, this function will be called when an item has been created.
   * @callback props.onItemCreated
   * @param {string} value - The value for the created item
   */
  /*
   * If provided, this function will be called when the user clicks the action
   * to collapse or uncollapse the OutlineView
   * @callback props.onCollapseToggled
   * @param {object} props - The entire props object for this OutlineView
   */
  static propTypes = {
    title: PropTypes.string,
    titleColor: PropTypes.string,
    iconName: PropTypes.string,
    items: PropTypes.array,
    collapsed: PropTypes.bool,
    onItemCreated: PropTypes.func,
    onCollapseToggled: PropTypes.func,
  };

  static defaultProps = {
    title: '',
    items: [],
  };

  state = {
    showCreateInput: false,
  };

  _clickingCreateButton: boolean;
  _expandTimeout?: ReturnType<typeof setTimeout>;

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    clearTimeout(this._expandTimeout);
  }

  // Handlers

  _onCreateButtonMouseDown = () => {
    this._clickingCreateButton = true;
  };

  _onCreateButtonClicked = () => {
    this._clickingCreateButton = false;
    this.setState({ showCreateInput: !this.state.showCreateInput });
  };

  _onCollapseToggled = () => {
    if (this.props.onCollapseToggled) {
      this.props.onCollapseToggled(this.props);
    }
  };

  _onDragStateChange = ({ isDropping }) => {
    if (this.props.collapsed && !this._expandTimeout && isDropping) {
      this._expandTimeout = setTimeout(this._onCollapseToggled, 650);
    } else if (this._expandTimeout && !isDropping) {
      clearTimeout(this._expandTimeout);
      this._expandTimeout = null;
    }
  };

  _onItemCreated = (item, value) => {
    this.setState({ showCreateInput: false });
    this.props.onItemCreated(value);
  };

  _onCreateInputCleared = () => {
    if (!this._clickingCreateButton) {
      this.setState({ showCreateInput: false });
    }
  };

  // Renderers

  _renderCreateInput(props = this.props) {
    const item = {
      id: `add-item-${props.title}`,
      name: '',
      children: [],
      editing: true,
      iconName: props.iconName,
      onEdited: this._onItemCreated,
      inputPlaceholder: localized('Create new item'),
      onInputCleared: this._onCreateInputCleared,
    };
    return <OutlineViewItem item={item} />;
  }

  _renderCreateButton() {
    return (
      <span
        className="add-item-button"
        role="button"
        tabIndex={0}
        aria-label={localized('Add item to %@', this.props.title)}
        onMouseDown={this._onCreateButtonMouseDown}
        onMouseUp={this._onCreateButtonClicked}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._onCreateButtonClicked();
          }
        }}
      >
        <RetinaImg
          url="mailspring://account-sidebar/assets/icon-sidebar-addcategory@2x.png"
          style={{ height: 15, width: 14 }}
          mode={RetinaImg.Mode.ContentIsMask}
          alt=""
        />
      </span>
    );
  }

  _renderHeading(allowCreate, collapsed, collapsible) {
    const collapseLabel = collapsed ? localized('Show') : localized('Hide');
    let style: CSSProperties = {};
    if (this.props.titleColor) {
      style = {
        height: '50%',
        paddingLeft: '4px',
        borderLeftWidth: '4px',
        borderLeftColor: this.props.titleColor,
        borderLeftStyle: 'solid',
      };
    }
    return (
      <DropZone
        className="heading"
        onDrop={() => true}
        onDragStateChange={this._onDragStateChange}
        shouldAcceptDrop={() => true}
      >
        <span style={style} className="text" title={this.props.title}>
          {this.props.title}
        </span>
        {allowCreate ? this._renderCreateButton() : null}
        {collapsible ? (
          <span
            className="collapse-button"
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? localized('Expand %@', this.props.title)
                : localized('Collapse %@', this.props.title)
            }
            onClick={this._onCollapseToggled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._onCollapseToggled();
              }
            }}
          >
            {collapseLabel}
          </span>
        ) : null}
      </DropZone>
    );
  }

  _renderItems(sectionTitle?: string) {
    const noneSelected = !this.props.items.some((item) => item.selected);
    return this.props.items.map((item, idx) => (
      <OutlineViewItem
        key={item.id}
        item={item}
        isFirst={noneSelected && idx === 0}
        sectionTitle={idx === 0 ? sectionTitle : undefined}
      />
    ));
  }

  _onTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Don't intercept keyboard events when typing in an input (e.g. rename or new folder)
    if ((event.target as HTMLElement).tagName === 'INPUT') return;

    const tree = event.currentTarget;
    const items = Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
      (el) => !el.closest('[aria-expanded="false"] [role="treeitem"]')
    );

    const focused = document.activeElement as HTMLElement;
    const currentIndex = items.indexOf(focused);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const next = items[currentIndex + 1];
      if (next) {
        next.setAttribute('tabIndex', '0');
        if (focused && focused !== next) focused.setAttribute('tabIndex', '-1');
        next.focus();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const prev = items[currentIndex - 1];
      if (prev) {
        prev.setAttribute('tabIndex', '0');
        if (focused && focused !== prev) focused.setAttribute('tabIndex', '-1');
        prev.focus();
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (focused) {
        const expanded = focused.getAttribute('aria-expanded');
        if (expanded === 'false') {
          // Click the disclosure triangle to expand
          const triangle = focused.querySelector<HTMLElement>('.disclosure-triangle');
          if (triangle) triangle.click();
        } else if (expanded === 'true') {
          // Move to first child
          const firstChild = items[currentIndex + 1];
          if (firstChild) {
            firstChild.setAttribute('tabIndex', '0');
            focused.setAttribute('tabIndex', '-1');
            firstChild.focus();
          }
        }
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (focused) {
        const expanded = focused.getAttribute('aria-expanded');
        if (expanded === 'true') {
          // Click the disclosure triangle to collapse
          const triangle = focused.querySelector<HTMLElement>('.disclosure-triangle');
          if (triangle) triangle.click();
        } else {
          // Move to parent treeitem
          let parent = focused.parentElement;
          while (parent && parent !== tree) {
            if (parent.getAttribute('role') === 'treeitem') {
              parent.setAttribute('tabIndex', '0');
              focused.setAttribute('tabIndex', '-1');
              parent.focus();
              break;
            }
            parent = parent.parentElement;
          }
        }
      }
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = items[0];
      if (first) {
        first.setAttribute('tabIndex', '0');
        if (focused && focused !== first) focused.setAttribute('tabIndex', '-1');
        first.focus();
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = items[items.length - 1];
      if (last) {
        last.setAttribute('tabIndex', '0');
        if (focused && focused !== last) focused.setAttribute('tabIndex', '-1');
        last.focus();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (focused) {
        const clickTarget = focused.querySelector<HTMLElement>('.item');
        if (clickTarget) clickTarget.click();
      }
    }
  };

  _renderOutline(allowCreate, collapsed) {
    if (collapsed) {
      return <span />;
    }

    const showInput = allowCreate && this.state.showCreateInput;
    return (
      <div role="tree" aria-label={this.props.title} onKeyDown={this._onTreeKeyDown}>
        {showInput ? this._renderCreateInput() : null}
        {this._renderItems(this.props.title || undefined)}
      </div>
    );
  }

  render() {
    const collapsible = this.props.onCollapseToggled;
    const collapsed = this.props.collapsed;
    const allowCreate = this.props.onItemCreated != null && !collapsed;

    return (
      <div className="outline-view nylas-outline-view">
        {this._renderHeading(allowCreate, collapsed, collapsible)}
        {this._renderOutline(allowCreate, collapsed)}
      </div>
    );
  }
}
