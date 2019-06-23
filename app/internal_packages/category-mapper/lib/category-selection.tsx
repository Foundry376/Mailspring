import React from 'react';
import utf7 from 'utf7';
import {
  RetinaImg,
  DropdownMenu,
  LabelColorizer,
  BoldedSearchResult,
} from 'mailspring-component-kit';
import { localized, Label, Utils, PropTypes } from 'mailspring-exports';

interface CategorySelectionProps {
  allowLabels: boolean;
  all: CategoryItem[];
  current: CategoryItem;
  onSelect: (item: CategoryItem) => void;
}

interface CategorySelectionState {
  searchValue: string;
}

type CategoryItem = {
  backgroundColor?: string;
  empty?: boolean;
  path?: string;
  name?: string;
};

export default class CategorySelection extends React.Component<
  CategorySelectionProps,
  CategorySelectionState
> {
  static propTypes = {
    allowLabels: PropTypes.bool,
    all: PropTypes.array,
    current: PropTypes.object,
    onSelect: PropTypes.func,
  };

  _categories = [];

  state = {
    searchValue: '',
  };

  _itemsForCategories(): CategoryItem[] {
    return this.props.all
      .sort((a, b) => {
        var pathA = utf7.imap.decode(a.path).toUpperCase();
        var pathB = utf7.imap.decode(b.path).toUpperCase();
        if (pathA < pathB) {
          return -1;
        }
        if (pathA > pathB) {
          return 1;
        }
        return 0;
      })
      .filter(c => Utils.wordSearchRegExp(this.state.searchValue).test(utf7.imap.decode(c.path)))
      .map(c => {
        c.backgroundColor = LabelColorizer.backgroundColorDark(c);
        return c;
      });
  }

  _onSearchValueChange = event => {
    this.setState({ searchValue: event.target.value });
  };

  _renderItem = (item: CategoryItem = { empty: true }) => {
    let icon;
    if (item.empty) {
      icon = <div className="empty-icon" />;
      item.path = `(${localized('None')})`;
    } else {
      icon = (
        <RetinaImg
          name={`${item.name}.png`}
          fallback={item instanceof Label ? 'tag.png' : 'folder.png'}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      );
    }

    const displayPath = utf7.imap.decode(item.path);

    return (
      <div className="category-item">
        {icon}
        <div className="category-display-name">
          <BoldedSearchResult value={displayPath} query={this.state.searchValue || ''} />
        </div>
      </div>
    );
  };

  render() {
    const placeholder = this.props.allowLabels
      ? localized('Choose folder or label')
      : localized('Choose folder');

    const headerComponents = [
      <input
        type="text"
        tabIndex={-1}
        key="textfield"
        className="search"
        placeholder={placeholder}
        value={this.state.searchValue}
        onChange={this._onSearchValueChange}
      />,
    ];

    return (
      <div className="category-picker-dropdown">
        <DropdownMenu
          intitialSelectionItem={this.props.current || { empty: true }}
          headerComponents={headerComponents}
          footerComponents={[]}
          items={this._itemsForCategories()}
          itemKey={item => item.id}
          itemContent={this._renderItem}
          defaultSelectedIndex={this.state.searchValue === '' ? -1 : 0}
          {...this.props}
        />
      </div>
    );
  }
}
