import React from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import OnboardingStore from './onboarding-store';
import PageTopBar from './page-top-bar';

import WelcomePage from './page-welcome';
import TutorialPage from './page-tutorial';
import AuthenticatePage from './page-authenticate';
import AccountChoosePage from './page-account-choose';
import AccountSettingsPage from './page-account-settings';
import AccountSettingsPageGmail from './page-account-settings-gmail';
import AccountSettingsPageIMAP from './page-account-settings-imap';
import AccountSettingsPageOffice365 from './page-account-settings-office365';
import AccountSettingsPageYahoo from './page-account-settings-yahoo';
import AccountOnboardingSuccess from './page-account-onboarding-success';
import InitialPreferencesPage from './page-initial-preferences';

const PageComponents = {
  welcome: WelcomePage,
  tutorial: TutorialPage,
  authenticate: AuthenticatePage,
  'account-choose': AccountChoosePage,
  'account-settings': AccountSettingsPage,
  'account-settings-gmail': AccountSettingsPageGmail,
  'account-settings-office365': AccountSettingsPageOffice365,
  'account-settings-yahoo': AccountSettingsPageYahoo,
  'account-settings-imap': AccountSettingsPageIMAP,
  'account-onboarding-success': AccountOnboardingSuccess,
  'initial-preferences': InitialPreferencesPage,
};

export default class OnboardingRoot extends React.Component {
  static displayName = 'OnboardingRoot';
  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStore();
  }

  componentDidMount() {
    this.unsubscribe = OnboardingStore.listen(this._onStateChanged, this);
    AppEnv.center();
    AppEnv.displayWindow();
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _getStateFromStore = () => {
    return {
      page: OnboardingStore.page(),
      pageDepth: OnboardingStore.pageDepth(),
      account: OnboardingStore.account(),
    };
  };

  _onStateChanged = () => {
    this.setState(this._getStateFromStore());
  };

  render() {
    const Component = PageComponents[this.state.page];
    if (!Component) {
      throw new Error(`Cannot find component for page: ${this.state.page}`);
    }

    return (
      <div className="page-frame">
        <PageTopBar
          pageDepth={this.state.pageDepth}
          allowMoveBack={!['initial-preferences', 'account-choose'].includes(this.state.page)}
        />
        <CSSTransitionGroup
          transitionName="alpha-fade"
          transitionLeaveTimeout={150}
          transitionEnterTimeout={150}
        >
          <div key={this.state.page} className="page-container">
            <Component account={this.state.account} />
          </div>
        </CSSTransitionGroup>
      </div>
    );
  }
}
