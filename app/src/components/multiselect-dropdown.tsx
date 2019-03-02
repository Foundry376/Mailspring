import React, { Component } from 'react';
import { ButtonDropdown, Menu } from 'mailspring-component-kit';
import PropTypes from 'prop-types';

type MultiselectDropdownProps = {
  className?: string;
  items: any[];
  itemChecked?: (...args: any[]) => any;
  onToggleItem?: (...args: any[]) => any;
  itemKey?: (...args: any[]) => any;
  buttonText?: string;
  itemContent?: (...args: any[]) => any;
  attachment?: string;
};
/*
Renders a drop down of items that can have multiple selected
Item can be string or object

@param {object} props - props for MultiselectDropdown
@param {string} props.className - css class applied to the component
@param {array} props.items - items to be rendered in the dropdown
@param {props.itemChecked} - props.itemChecked -- a function to determine if the item should be checked or not
@param {props.onToggleItem} - props.onToggleItem -- function called when an item is clicked
@param {props.itemKey} - props.itemKey -- function that indicates how to select the key for each MenuItem
@param {props.buttonText} - props.buttonText -- string to be rendered in the button
**/

class MultiselectDropdown extends Component<MultiselectDropdownProps> {
  static displayName = 'MultiselectDropdown';

  static propTypes = {
    className: PropTypes.string,
    items: PropTypes.array.isRequired,
    itemChecked: PropTypes.func,
    onToggleItem: PropTypes.func,
    itemKey: PropTypes.func,
    buttonText: PropTypes.string,
    itemContent: PropTypes.func,
    attachment: PropTypes.string,
  };

  static defaultProps = {
    className: '',
    items: [],
    itemChecked: {},
    onToggleItem: () => {},
    itemKey: () => {},
    buttonText: '',
    itemContent: () => {},
  };

  _onItemClick = item => {
    this.props.onToggleItem(item);
  };

  _renderItem = item => {
    const MenuItem = Menu.Item;
    return (
      <MenuItem
        onMouseDown={() => this._onItemClick(item)}
        checked={this.props.itemChecked(item)}
        key={this.props.itemKey(item)}
        content={this.props.itemContent(item)}
      />
    );
  };

  _renderMenu = items => {
    return (
      <Menu
        items={items}
        itemContent={this._renderItem}
        itemKey={item => this.props.itemKey(item)}
        onSelect={() => {}}
      />
    );
  };

  render() {
    const { items, attachment } = this.props;
    const menu = this._renderMenu(items);
    return (
      <ButtonDropdown
        className={'btn-multiselect'}
        primaryItem={<span>{this.props.buttonText}</span>}
        attachment={attachment}
        menu={menu}
      />
    );
  }
}
export default MultiselectDropdown;
