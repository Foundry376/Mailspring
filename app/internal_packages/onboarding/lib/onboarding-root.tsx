import React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { Account, AccountStore } from 'mailspring-exports';
import OnboardingStore from './onboarding-store';
import PageTopBar from './page-top-bar';

import WelcomePage from './page-welcome';
import TutorialPage from './page-tutorial';
import AuthenticatePage from './page-authenticate';
import AccountChoosePage from './page-account-choose';
import AccountSettingsPage from './page-account-settings';
import AccountSettingsPageGmail from './page-account-settings-gmail';
import AccountSettingsPageO365 from './page-account-settings-o365';
import AccountSettingsPageIMAP from './page-account-settings-imap';
import AccountOnboardingSuccess from './page-account-onboarding-success';
import InitialPreferencesPage from './page-initial-preferences';
import InitialSubscriptionPage from './page-initial-subscription';
import AccountSettingsPageOutlook from './page-account-settings-outlook';

const PageComponents = {
  welcome: WelcomePage,
  tutorial: TutorialPage,
  authenticate: AuthenticatePage,
  'account-choose': AccountChoosePage,
  'account-settings': AccountSettingsPage,
  'account-settings-gmail': AccountSettingsPageGmail,
  'account-settings-o365': AccountSettingsPageO365,
  'account-settings-outlook': AccountSettingsPageOutlook,
  'account-settings-imap': AccountSettingsPageIMAP,
  'account-onboarding-success': AccountOnboardingSuccess,
  'initial-preferences': InitialPreferencesPage,
  'initial-subscription': InitialSubscriptionPage,
};

interface OnboardingRootState {
  pageDepth: number;
  page: string;
  account: Account;
}

export default class OnboardingRoot extends React.Component<
  Record<string, unknown>,
  OnboardingRootState
> {
  static displayName = 'OnboardingRoot';
  static containerRequired = false;

  unsubscribe?: () => void;

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
      // Guard against empty page stack (e.g. rapid back-button clicks draining the stack).
      // Close or quit rather than throwing an unhandled error.
      if (AccountStore.accounts().length === 0) {
        AppEnv.quit();
      } else {
        AppEnv.close();
      }
      return null;
    }

    return (
      <div className="page-frame">
        <PageTopBar
          pageDepth={this.state.pageDepth}
          allowMoveBack={!['initial-preferences', 'account-choose'].includes(this.state.page)}
        />
        <TransitionGroup component={null}>
          <CSSTransition key={this.state.page} classNames="alpha-fade" timeout={150}>
            <div className="page-container">
              <Component account={this.state.account} />
            </div>
          </CSSTransition>
        </TransitionGroup>
      </div>
    );
  }
}
