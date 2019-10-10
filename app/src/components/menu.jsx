const classNames = require('classnames');
const _ = require('underscore');
const { React, ReactDOM, PropTypes, DOMUtils } = require('mailspring-exports');
import ScrollRegion from './scroll-region';

/*
Public: `MenuItem` components can be provided to the {Menu} by the `itemContent` function.
MenuItem's props allow you to display dividers as well as standard items.

Section: Component Kit
*/
class MenuItem extends React.Component {
  static displayName = 'MenuItem';

  /*
    Public: React `props` supported by MenuItem:
  
     - `divider` (optional) Pass a {Boolean} to render the menu item as a section divider.
     - `key` (optional) Pass a {String} to be the React key to optimize rendering lists of items.
     - `selected` (optional) Pass a {Boolean} to specify whether the item is selected.
     - `checked` (optional) Pass a {Boolean} to specify whether the item is checked.
     - `disabled` (optional) Pass a {Boolean} to specify whether the item is disabled, default is false.
    */
  static propTypes = {
    divider: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    selected: PropTypes.bool,
    checked: PropTypes.bool,
    disabled: PropTypes.bool,
  };

  static default = {
    disabled: false,
  };

  render() {
    if (this.props.divider) {
      const dividerLabel = _.isString(this.props.divider) ? this.props.divider : '';
      return <div className="item divider">{dividerLabel}</div>;
    } else {
      const className = classNames({
        item: true,
        selected: this.props.selected,
        checked: this.props.checked,
        disabled: this.props.disabled,
      });
      return (
        <div
          className={className}
          onMouseDown={this.props.onMouseDown}
          onMouseOver={this.props.onMouseOver}
        >
          {this.props.content}
        </div>
      );
    }
  }
}

/*
Public: React component for a {Menu} item that displays a name and email address.

Section: Component Kit
*/
class MenuNameEmailItem extends React.Component {
  static displayName = 'MenuNameEmailItem';

  /*
    Public: React `props` supported by MenuNameEmailItem:
  
     - `name` (optional) The {String} name to be displayed.
     - `email` (optional) The {String} email address to be displayed.
    */
  static propTypes = {
    name: PropTypes.string,
    email: PropTypes.string,
  };

  render() {
    if (this.props.name && this.props.name !== this.props.email) {
      return (
        <span>
          <span className="primary">{this.props.name}</span>
          <span className="secondary">{`(${this.props.email})`}</span>
        </span>
      );
    } else {
      return <span className="primary">{this.props.email}</span>;
    }
  }
}

/*
Public: React component for multi-section Menus with key binding

The Menu component allows you to display a list of items. Menu takes care of
several important things, ensuring that your menu is consistent with the rest
of the N1 application and offers a near-native experience:

- Keyboard Interaction with the Up and Down arrow keys, Enter to select
- Maintaining selection across content changes
- Highlighted state

Menus are often, but not always, used in conjunction with {Popover} to display
a floating "popup" menu. See `template-picker.jsx` for an example.

The Menu also exposes "header" and "footer" regions you can fill with arbitrary
components by providing the `headerComponents` and `footerComponents` props.
These items are nested within `.header-container`. and `.footer-container`,
and you can customize their appearance by providing CSS selectors scoped to your
component's Menu instance:

```css
.template-picker .menu .header-container {
  height: 100px;
}
```

Section: Component Kit
*/
class Menu extends React.Component {
  static displayName = 'Menu';

  /*
    Public: React `props` supported by Menu:
  
     - `className` (optional) The {String} class name applied to the Menu
  
     - `itemContent` A {Function} that returns a {MenuItem}, {String}, or
       React component for the given `item`.
  
       If you return a {MenuItem}, your item is injected into the list directly.
  
       If you return a string or React component, the result is placed within a
       {MenuItem}, resulting in the following DOM:
       `<div className="item [selected]">{your content}</div>`.
  
       To create dividers and other special menu items, return an instance of:
  
       <Menu.Item divider="Label">
  
     - `itemKey` A {Function} that returns a unique string key for the given `item`.
       Keys are important for efficient React rendering when `items` is changed, and a
       key function is required.
  
     - `itemChecked` A {Function} that returns true if the given item should be shown
       with a checkmark. If you don't provide an implementation for `itemChecked`, no
       checkmarks are ever shown.
  
     - `items` An {Array} of arbitrary objects the menu should display.
  
     - `onSelect` A {Function} called with the selected item when the user clicks
       an item in the menu or confirms their selection with the Enter key.
  
     - `onEscape` A {Function} called when a user presses escape in the input.
  
     - `defaultSelectedIndex` The index of the item first selected if there
     was no other previous index. Defaults to 0. Set to -1 if you want
     nothing selected.
  
    */
  static propTypes = {
    className: PropTypes.string,
    footerComponents: PropTypes.node,
    headerComponents: PropTypes.node,
    itemContext: PropTypes.object,
    itemContent: PropTypes.func.isRequired,
    itemKey: PropTypes.func.isRequired,
    itemChecked: PropTypes.func,

    items: PropTypes.array.isRequired,

    onSelect: PropTypes.func.isRequired,

    onEscape: PropTypes.func,

    defaultSelectedIndex: PropTypes.number,
    maxHeight: PropTypes.number,
  };

  static defaultProps = { onEscape() {}, maxHeight: 0 };

  constructor(props) {
    super(props);
    this._mounted = false;
    this.state = {
      selectedIndex: this.props.defaultSelectedIndex || 0,
    };
  }

  // Public: Returns the currently selected item.
  //
  getSelectedItem = () => {
    return this.props.items[this.state.selectedIndex];
  };

  // TODO this is a hack, refactor
  clearSelection = () => {
    setImmediate(() => {
      if (this._mounted === false) {
        return;
      }
      this.setState({ selectedIndex: -1 });
    });
  };

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    // Attempt to preserve selection across props.items changes by
    // finding an item in the new list with a key matching the old
    // selected item's key
    let newSelectionIndex, selection;
    if (this.state.selectedIndex >= 0) {
      selection = this.props.items[this.state.selectedIndex];
      newSelectionIndex = 0;
    } else {
      newSelectionIndex =
        newProps.defaultSelectedIndex != null ? newProps.defaultSelectedIndex : -1;
    }

    if (selection != null) {
      const selectionKey = this.props.itemKey(selection);
      const newSelection = _.find(
        newProps.items,
        item => this.props.itemKey(item) === selectionKey
      );
      if (newSelection != null) {
        newSelectionIndex = newProps.items.indexOf(newSelection);
      }
    }

    this.setState({
      selectedIndex: newSelectionIndex,
    });
  }

  componentDidUpdate() {
    if ((this.props.items || []).length === 0) {
      return;
    }
    const item = ReactDOM.findDOMNode(this).querySelector('.selected');
    const container = ReactDOM.findDOMNode(this).querySelector('.content-container');
    const adjustment = DOMUtils.scrollAdjustmentToMakeNodeVisibleInContainer(item, container);
    if (adjustment !== 0) {
      container.scrollTop += adjustment;
    }
  }

  render() {
    const hc = this.props.headerComponents || <span />;
    const fc = this.props.footerComponents || <span />;
    const className = this.props.className ? this.props.className : '';
    return (
      <div onKeyDown={this._onKeyDown} className={`menu ${className}`} tabIndex="-1">
        <div className="header-container">{hc}</div>
        {this._contentContainer()}
        <div className="footer-container">{fc}</div>
      </div>
    );
  }

  _onKeyDown = event => {
    if (this.props.items.length === 0) {
      return;
    }
    event.stopPropagation();
    if (['Enter', 'Return'].includes(event.key)) {
      this._onEnter();
    }
    if (event.key === 'Escape') {
      this._onEscape();
    } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
      this._onShiftSelectedIndex(-1);
      event.preventDefault();
    } else if (event.key === 'ArrowDown' || event.key === 'Tab') {
      this._onShiftSelectedIndex(1);
      event.preventDefault();
    }
  };

  _contentContainer = () => {
    const seenItemKeys = {};

    const items = (this.props.items || []).map((item, i) => {
      const content = this.props.itemContent(item);
      if (React.isValidElement(content) && content.type === MenuItem) {
        return content;
      }

      const onMouseDown = event => {
        event.preventDefault();
        if (item.disabled) {
          return;
        }
        this.setState({ selectedIndex: i });
        if (this.props.onSelect) {
          return this.props.onSelect(item);
        }
      };

      const onMouseOver = () => {
        this.setState({ selectedIndex: i });
      };

      const key = this.props.itemKey(item);
      if (!key) {
        console.warn('Menu parent did not return an itemKey for item', item);
      }
      if (seenItemKeys[key]) {
        console.warn({ 'Menu items have colliding keys': item }, seenItemKeys[key]);
      }
      seenItemKeys[key] = item;

      return (
        <MenuItem
          key={key}
          onMouseDown={onMouseDown}
          onMouseOver={onMouseOver}
          checked={this.props.itemChecked && this.props.itemChecked(item)}
          content={content}
          selected={this.state.selectedIndex === i}
        />
      );
    });

    const contentClass = classNames({
      'content-container': true,
      empty: items.length === 0,
    });
    if (this.props.maxHeight > 0) {
      return (
        <ScrollRegion className={contentClass} style={{ height: this.props.maxHeight }}>
          {items}
        </ScrollRegion>
      );
    }

    return <div className={contentClass}>{items}</div>;
  };

  _onShiftSelectedIndex = delta => {
    if (this.props.items.length === 0) {
      return;
    }

    let index = this.state.selectedIndex + delta;

    let isDivider = true;
    while (isDivider) {
      const item = this.props.items[index];
      if (!item) {
        break;
      }

      const itemContext = this.props.itemContent(item, this.props.itemContext).props || {};

      if (itemContext.divider) {
        if (delta > 0) {
          index += 1;
        } else if (delta < 0) {
          index -= 1;
        }
      } else {
        isDivider = false;
      }
    }

    index = Math.max(0, Math.min(this.props.items.length - 1, index));

    // Update the selected index
    this.setState({ selectedIndex: index });
  };

  _onEnter = () => {
    const item = this.props.items[this.state.selectedIndex];
    if (item != null) {
      this.props.onSelect(item);
    }
  };

  _onEscape = () => {
    this.props.onEscape();
  };
}

Menu.Item = MenuItem;
Menu.NameEmailItem = MenuNameEmailItem;

module.exports = Menu;
