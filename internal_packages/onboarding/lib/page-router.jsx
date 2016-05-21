import React from 'react';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';
import PageRouterStore from './page-router-store';
import PageTopBar from './page-top-bar';

import WelcomePage from './welcome-page';
import TutorialPage from './tutorial-page';
import AuthenticatePage from './authenticate-page';
import AccountChoosePage from './account-choose-page';
import AccountSettingsPage from './account-settings-page';
import AccountSettingsPageGmail from './account-settings-page-gmail';
import AccountSettingsPageIMAP from './account-settings-page-imap';
import InitialPreferencesPage from './initial-preferences-page';

const PageComponents = {
  "welcome": WelcomePage,
  "tutorial": TutorialPage,
  "authenticate": AuthenticatePage,
  "account-choose": AccountChoosePage,
  "account-settings": AccountSettingsPage,
  "account-settings-gmail": AccountSettingsPageGmail,
  "account-settings-imap": AccountSettingsPageIMAP,
  "initial-preferences": InitialPreferencesPage,
}

export default class PageRouter extends React.Component {
  static displayName = 'PageRouter';
  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStore();
  }

  componentDidMount() {
    this.unsubscribe = PageRouterStore.listen(this._onStateChanged, this);
    NylasEnv.center();
    NylasEnv.displayWindow();
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _getStateFromStore = () => {
    return {
      page: PageRouterStore.page(),
      pageDepth: PageRouterStore.pageDepth(),
      accountInfo: PageRouterStore.accountInfo(),
    };
  }

  _onStateChanged = () => {
    this.setState(this._getStateFromStore());
  }

  render() {
    const Component = PageComponents[this.state.page];
    if (!Component) {
      throw new Error(`Cannot find component for page: ${this.state.page}`);
    }

    return (
      <div className="page-frame">
        <PageTopBar pageDepth={this.state.pageDepth} />
        <ReactCSSTransitionGroup
          transitionName="alpha-fade"
          transitionLeaveTimeout={150}
          transitionEnterTimeout={150}
        >
          <div key={this.state.page} className="page-container">
            <Component accountInfo={this.state.accountInfo} ref="activePage" />
          </div>
        </ReactCSSTransitionGroup>
      </div>
    );
  }
}
