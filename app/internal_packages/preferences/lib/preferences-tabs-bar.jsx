import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Actions, PreferencesUIStore } from 'mailspring-exports';

class PreferencesTabItem extends React.Component {
  static displayName = 'PreferencesTabItem';

  static propTypes = {
    selection: PropTypes.shape({
      accountId: PropTypes.string,
      tabId: PropTypes.string,
    }).isRequired,
    tabItem: PropTypes.instanceOf(PreferencesUIStore.TabItem).isRequired,
  };

  _onClick = () => {
    Actions.switchPreferencesTab(this.props.tabItem.tabId);
  };

  _onClickAccount = (event, accountId) => {
    Actions.switchPreferencesTab(this.props.tabItem.tabId, { accountId });
    event.stopPropagation();
  };

  render() {
    const { selection, tabItem } = this.props;
    const { tabId, displayName } = tabItem;
    const classes = classNames({
      item: true,
      active: tabId === selection.tabId,
    });

    return (
      <div className={classes} onClick={this._onClick}>
        <div className="name">{displayName}</div>
      </div>
    );
  }
}

class PreferencesTabsBar extends React.Component {
  static displayName = 'PreferencesTabsBar';

  static propTypes = {
    tabs: PropTypes.array.isRequired,
    selection: PropTypes.shape({
      accountId: PropTypes.string,
      tabId: PropTypes.string,
    }).isRequired,
  };

  renderTabs() {
    return this.props.tabs.map(tabItem => (
      <PreferencesTabItem key={tabItem.tabId} tabItem={tabItem} selection={this.props.selection} />
    ));
  }

  render() {
    return <div className="container-preference-tabs">{this.renderTabs()}</div>;
  }
}

export default PreferencesTabsBar;
