import React from 'react';
import { Actions, IdentityStore, localized, localizedReactFragment } from 'mailspring-exports';
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
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div className="basic-explanation">
            {localizedReactFragment(
              `You are using %@, which is free! You can link up to four email accounts and try pro features like snooze, send later, read receipts and reminders a few times a week.`,
              <strong>{localized('Mailspring Basic')}</strong>
            )}
            <span className="platform-linux-only">
              {localizedReactFragment(
                `Mailspring is independent %@ software, and subscription revenue allows us spend time maintaining and improving the product.`,
                <a href="https://github.com/Foundry376/Mailspring/">{localized('open source')}</a>
              )}
            </span>
            <br />
            <br />
            {localizedReactFragment(
              `Upgrade to %@ to use all these great features permanently:`,
              <a onClick={onLearnMore}>{localized('Mailspring Pro')}</a>
            )}
            <div className="features">
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Rich contact profiles`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Follow-up reminders`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Read Receipts`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Link tracking`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Powerful template support`)}
                </li>
              </ul>
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Send Later`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Company overviews`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Snooze messages`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Mailbox insights`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`... and much more!`)}
                </li>
              </ul>
            </div>
          </div>
          <div className="subscription-actions">
            <div className="pro-feature-ring">
              <RetinaImg name="pro-feature-ring.png" mode={RetinaImg.Mode.ContentPreserve} />
              <div className="price">$8</div>
              <div className="period">{localized('Monthly')}</div>
            </div>
            <div
              className="btn btn-emphasis"
              onClick={this._onUpgrade}
              style={{ verticalAlign: 'top' }}
            >
              <RetinaImg name="ic-upgrade.png" mode={RetinaImg.Mode.ContentIsMask} />{' '}
              {localized(`Get Mailspring Pro`)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  _renderPaidPlan(planName, effectivePlanName) {
    const planDisplayName = planName.replace('Annual', ` (${localized('annual')})`);

    const unpaidNote = effectivePlanName !== planName && (
      <p>
        {localized(
          `Note: Due to issues with your most recent payment, you've been temporarily downgraded to Mailspring %@. Click 'Billing' below to correct the issue.`,
          effectivePlanName
        )}
      </p>
    );
    return (
      <div className="row padded">
        <div>
          Thank you for using{' '}
          <strong style={{ textTransform: 'capitalize' }}>{`Mailspring ${planDisplayName}`}</strong>{' '}
          and supporting independent software. Get the most out of your subscription: visit the{' '}
          <a href="https://foundry376.zendesk.com/hc/en-us/sections/115000521592-Getting-Started">
            Help Center
          </a>{' '}
          to learn more about great features like reminders, templates, and activity insights.
          {unpaidNote}
        </div>
        <div style={{ paddingTop: 15 }}>
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
    const {
      firstName,
      lastName,
      emailAddress,
      stripePlan = '',
      stripePlanEffective = '',
    } = identity;

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
                  {localized('Sign Out')}
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
