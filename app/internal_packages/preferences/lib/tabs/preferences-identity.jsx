import React from 'react';
import { Actions, IdentityStore } from 'mailspring-exports';
import { OpenIdentityPageButton, BillingModal, RetinaImg } from 'mailspring-component-kit';
import { shell } from 'electron';

class RefreshButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = { refreshing: false };
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _onClick = () => {
    this.setState({ refreshing: true });
    IdentityStore.fetchIdentity().then(() => {
      setTimeout(() => {
        if (this._mounted) {
          this.setState({ refreshing: false });
        }
      }, 400);
    });
  };

  render() {
    return (
      <div className={`refresh ${this.state.refreshing && 'spinning'}`} onClick={this._onClick}>
        <RetinaImg name="ic-refresh.png" mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }
}

class PreferencesIdentity extends React.Component {
  static displayName = 'PreferencesIdentity';

  constructor() {
    super();
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribe = IdentityStore.listen(() => {
      this.setState(this._getStateFromStores());
    });
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  _getStateFromStores() {
    return {
      identity: IdentityStore.identity() || {},
    };
  }

  _onUpgrade = () => {
    Actions.openModal({
      component: <BillingModal source="preferences" />,
      width: BillingModal.IntrinsicWidth,
      height: BillingModal.IntrinsicHeight,
    });
  };

  _renderBasic() {
    const onLearnMore = () => shell.openExternal('https://getmailspring.com/pro');
    return (
      <div className="row padded">
        <div style={{ display: 'flex' }}>
          <div className="basic-explanation">
            You are using <strong>Mailspring Basic</strong>, which is free! You can link up to four
            email accounts and try pro features like snooze, send later, read receipts and reminders
            a few times a week.
            <br />
            <br />
            Upgrade to <a onClick={onLearnMore}>Mailspring Pro</a> to use all these features
            permanently:
            <div className="features">
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Rich contact profiles
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Follow-up reminders
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Read receipts
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Link tracking
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Powerful template support
                </li>
              </ul>
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Send later
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Company overviews
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Snooze messages
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Mailbox insights
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />... and much more!
                </li>
              </ul>
            </div>
          </div>
          <div className="subscription-actions">
            <div className="pro-feature-ring">
              <RetinaImg name="pro-feature-ring.png" mode={RetinaImg.Mode.ContentPreserve} />
              <div className="price">$8</div>
              <div className="period">monthly</div>
            </div>
            <div
              className="btn btn-emphasis"
              onClick={this._onUpgrade}
              style={{ verticalAlign: 'top' }}
            >
              <RetinaImg name="ic-upgrade.png" mode={RetinaImg.Mode.ContentIsMask} /> Get Mailspring
              Pro
            </div>
          </div>
        </div>
      </div>
    );
  }

  _renderPaidPlan(planName, effectivePlanName) {
    const unpaidNote = effectivePlanName !== planName && (
      <p
      >{`Note: Due to issues with your most recent payment, you've been temporarily downgraded to Mailspring ${effectivePlanName}. Click 'Billing' below to correct the issue.`}</p>
    );
    return (
      <div className="row padded">
        <div>
          Thank you for using{' '}
          <strong style={{ textTransform: 'capitalize' }}>{`Mailspring ${planName}`}</strong> and
          supporting independent software.
          {unpaidNote}
        </div>
        <div className="subscription-actions">
          <OpenIdentityPageButton
            label="Manage Billing"
            path="/dashboard#billing"
            source="Preferences Billing"
            campaign="Dashboard"
          />
        </div>
      </div>
    );
  }

  render() {
    const { identity } = this.state;
    const { firstName, lastName, emailAddress, stripePlan, stripePlanEffective } = identity;

    const logout = () => Actions.logoutNylasIdentity();

    return (
      <div className="container-identity">
        <div className="identity-content-box">
          <div className="row padded">
            <div className="identity-info">
              <RefreshButton />
              <div className="name">
                {firstName} {lastName}
              </div>
              <div className="email">{emailAddress}</div>
              <div className="identity-actions">
                <OpenIdentityPageButton
                  label="Account Details"
                  path="/dashboard"
                  source="Preferences"
                  campaign="Dashboard"
                />
                <div className="btn minor-width" onClick={logout}>
                  Sign Out
                </div>
              </div>
            </div>
          </div>
          {stripePlan === 'Basic'
            ? this._renderBasic()
            : this._renderPaidPlan(stripePlan, stripePlanEffective)}
        </div>
      </div>
    );
  }
}

export default PreferencesIdentity;
