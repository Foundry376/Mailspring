import React from 'react';
import fs from 'fs';
import classNames from 'classnames';

import { Flexbox, RetinaImg } from 'mailspring-component-kit';
import { Actions, PreferencesUIStoreTab, Utils } from 'mailspring-exports';

interface PreferencesTabItemProps {
  selection: {
    accountId: string;
    tabId: string;
  };
  tabItem?: PreferencesUIStoreTab;
}

class PreferencesTabItem extends React.Component<PreferencesTabItemProps> {
  static displayName = 'PreferencesTabItem';

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

    const icon = (
      <RetinaImg
        style={{ width: 40, height: 40 }}
        className="tab-icon"
        name={`icon-preferences-${tabId.toLowerCase().replace(' ', '-')}.png`}
        fallback={`icon-preferences-general.png`}
        mode={RetinaImg.Mode.ContentPreserve}
      />
    );

    return (
      <div className={classes} onClick={this._onClick}>
        {icon}
        <div className="name">{displayName}</div>
      </div>
    );
  }
}

interface PreferencesTabBarProps {
  tabs: PreferencesUIStoreTab[];
  selection: {
    accountId: string;
    tabId: string;
  };
}

class PreferencesTabsBar extends React.Component<PreferencesTabBarProps> {
  static displayName = 'PreferencesTabsBar';

  renderTabs() {
    return this.props.tabs.map(tabItem => (
      <PreferencesTabItem key={tabItem.tabId} tabItem={tabItem} selection={this.props.selection} />
    ));
  }

  render() {
    return (
      <div className="container-preference-tabs">
        <Flexbox direction="row" className="preferences-tabs">
          <div style={{ flex: 0.5 }} />
          {this.renderTabs()}
          <div style={{ flex: 0.5 }} />
        </Flexbox>
      </div>
    );
  }
}

export default PreferencesTabsBar;
