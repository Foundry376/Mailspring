/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component, CSSProperties } from 'react';
import PropTypes from 'prop-types';
import { Menu, RetinaImg, LabelColorizer, BoldedSearchResult } from 'mailspring-component-kit';
import {
  Utils,
  localized,
  Actions,
  TaskQueue,
  Label,
  Account,
  SyncbackCategoryTask,
  ChangeLabelsTask,
  Thread,
} from 'mailspring-exports';
import { Categories } from 'mailspring-observables';
import { CategoryData } from './types';

interface LabelPickerPopoverProps {
  threads: Thread[];
  account: Account;
}

interface LabelPickerPopoverState {
  searchValue: string;
  categoryData: CategoryData[];
}

export default class LabelPickerPopover extends Component<
  LabelPickerPopoverProps,
  LabelPickerPopoverState
> {
  static propTypes = {
    threads: PropTypes.array.isRequired,
    account: PropTypes.object.isRequired,
  };

  _labels: Label[] = [];
  disposables: Rx.Disposable[];

  constructor(props) {
    super(props);
    this.state = this._recalculateState(this.props, { searchValue: '' });
  }

  componentDidMount() {
    this._registerObservables();
  }

  componentWillReceiveProps(nextProps) {
    this._registerObservables(nextProps);
    this.setState(this._recalculateState(nextProps));
  }

  componentWillUnmount() {
    this._unregisterObservables();
  }

  _registerObservables = (props = this.props) => {
    this._unregisterObservables();
    this.disposables = [
      Categories.forAccount(props.account)
        .sort()
        .subscribe(this._onLabelsChanged),
    ];
  };

  _unregisterObservables = () => {
    if (this.disposables) {
      this.disposables.forEach(disp => disp.dispose());
    }
  };

  _recalculateState = (props = this.props, { searchValue = this.state.searchValue || '' } = {}) => {
    const { threads } = props;

    if (threads.length === 0) {
      return { categoryData: [], searchValue };
    }

    const categoryData = this._labels
      .filter(label => Utils.wordSearchRegExp(searchValue).test(label.displayName))
      .map<CategoryData>(label => {
        return {
          id: label.id,
          category: label,
          displayName: label.displayName,
          backgroundColor: LabelColorizer.backgroundColorDark(label),
          usage: threads.filter(t => t.categories.find(c => c.id === label.id)).length,
          numThreads: threads.length,
        };
      });

    if (searchValue.length > 0) {
      categoryData.push({
        searchValue: searchValue,
        newCategoryItem: true,
        id: 'category-create-new',
      });
    }
    return { categoryData, searchValue };
  };

  _onLabelsChanged = categories => {
    this._labels = categories.filter(c => {
      return c instanceof Label && !c.role;
    });
    this.setState(this._recalculateState());
  };

  _onEscape = () => {
    Actions.closePopover();
  };

  _onSelectLabel = item => {
    const { account, threads } = this.props;

    if (threads.length === 0) return;

    if (item.newCategoryItem) {
      const syncbackTask = SyncbackCategoryTask.forCreating({
        name: this.state.searchValue,
        accountId: account.id,
      });

      TaskQueue.waitForPerformRemote(syncbackTask).then(finishedTask => {
        if (!finishedTask.created) {
          AppEnv.showErrorDialog({ title: 'Error', message: `Could not create label.` });
          return;
        }
        Actions.queueTask(
          new ChangeLabelsTask({
            source: 'Category Picker: New Category',
            threads: threads,
            labelsToRemove: [],
            labelsToAdd: [finishedTask.created],
          })
        );
      });
      Actions.queueTask(syncbackTask);
    } else if (item.usage === threads.length) {
      Actions.queueTask(
        new ChangeLabelsTask({
          source: 'Category Picker: Existing Category',
          threads: threads,
          labelsToRemove: [item.category],
          labelsToAdd: [],
        })
      );
    } else {
      Actions.queueTask(
        new ChangeLabelsTask({
          source: 'Category Picker: Existing Category',
          threads: threads,
          labelsToRemove: [],
          labelsToAdd: [item.category],
        })
      );
    }
    Actions.closePopover();
  };

  _onSearchValueChange = event => {
    this.setState(this._recalculateState(this.props, { searchValue: event.target.value }));
  };

  _renderCheckbox = item => {
    const styles: CSSProperties = {};
    let checkStatus;
    styles.backgroundColor = item.backgroundColor;

    if (item.usage === 0) {
      checkStatus = <span />;
    } else if (item.usage < item.numThreads) {
      checkStatus = (
        <RetinaImg
          className="check-img dash"
          name="tagging-conflicted.png"
          mode={RetinaImg.Mode.ContentPreserve}
          onClick={() => this._onSelectLabel(item)}
        />
      );
    } else {
      checkStatus = (
        <RetinaImg
          className="check-img check"
          name="tagging-checkmark.png"
          mode={RetinaImg.Mode.ContentPreserve}
          onClick={() => this._onSelectLabel(item)}
        />
      );
    }

    return (
      <div className="check-wrap" style={styles}>
        <RetinaImg
          className="check-img check"
          name="tagging-checkbox.png"
          mode={RetinaImg.Mode.ContentPreserve}
          onClick={() => this._onSelectLabel(item)}
        />
        {checkStatus}
      </div>
    );
  };

  _renderCreateNewItem = ({ searchValue }) => {
    return (
      <div className="category-item category-create-new">
        <RetinaImg
          name={`tag.png`}
          className={`category-create-new-tag`}
          mode={RetinaImg.Mode.ContentIsMask}
        />
        <div className="category-display-name">
          <strong>&ldquo;{searchValue}&rdquo;</strong> ({localized(`Create`).toLocaleLowerCase()})
        </div>
      </div>
    );
  };

  _renderItem = item => {
    if (item.divider) {
      return <Menu.Item key={item.id} divider={item.divider} />;
    } else if (item.newCategoryItem) {
      return this._renderCreateNewItem(item);
    }

    return (
      <div className="category-item">
        {this._renderCheckbox(item)}
        <div className="category-display-name">
          <BoldedSearchResult value={item.displayName} query={this.state.searchValue || ''} />
        </div>
      </div>
    );
  };

  render() {
    const headerComponents = [
      <input
        type="text"
        tabIndex={1}
        key="textfield"
        className="search"
        placeholder={localized('Label as...')}
        value={this.state.searchValue}
        onChange={this._onSearchValueChange}
      />,
    ];

    return (
      <div className="category-picker-popover">
        <Menu
          headerComponents={headerComponents}
          footerComponents={[]}
          items={this.state.categoryData}
          itemKey={item => item.id}
          itemContent={this._renderItem}
          onSelect={this._onSelectLabel}
          onEscape={this._onEscape}
          defaultSelectedIndex={this.state.searchValue === '' ? -1 : 0}
        />
      </div>
    );
  }
}
