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

const ProTourFeatures = [
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115003340291--Add-reminders-to-sent-messages',
    icon: `icon-composer-reminders.png`,
    title: `Reminders`,
    text: `Never forget to follow up! Mailspring reminds you if your messages haven't received replies.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001881272--View-contact-and-company-profiles',
    icon: `toolbar-person-sidebar.png`,
    title: `Rich contact profiles`,
    text: `Write better emails with LinkedIn profiles, Twitter bios, message history, and more in the right sidebar.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001875431--Enable-read-receipts-link-tracking-and-notifications',
    icon: `icon-composer-eye.png`,
    title: `Read receipts`,
    text: `Get notified when each recipient opens your email to send timely follow-ups and reminders.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001875231--Reply-faster-with-email-templates',
    icon: `toolbar-templates.png`,
    title: `Mail Templates`,
    text: `Create templated messages and fill them quickly to reply to messages and automate your common workflows.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001875431--Enable-read-receipts-link-tracking-and-notifications',
    icon: `icon-composer-linktracking.png`,
    title: `Link tracking`,
    text: `See when recipients click links in your emails so you can follow up with precision`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001882012--Schedule-messages-to-send-later',
    icon: `icon-composer-sendlater.png`,
    title: `Send later`,
    text: `Schedule messages to send at the ideal time to maximize your email reply rate or automate drip emails.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001881272--View-contact-and-company-profiles',
    icon: `icon-composer-reminders.png`,
    title: `Company overviews`,
    text: `See detailed information about companies you email, including their size, funding and timezone.`,
  },
  {
    link:
      'https://foundry376.zendesk.com/hc/en-us/articles/115001881232--Snooze-emails-to-handle-them-later',
    icon: `toolbar-snooze.png`,
    title: `Snooze messages`,
    text: `Schedule messages to re-appear later to keep your inbox clean and focus on immediate todos.`,
  },
  {
    link: 'https://foundry376.zendesk.com/hc/en-us/articles/115002507891-Activity-Reports-In-Depth',
    icon: `icon-toolbar-activity.png`,
    title: `Mailbox insights`,
    text: `Use the Activity tab to get a birds-eye view of your mailbox: open and click rates, subject line effectiveness, and more.`,
  },
];

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
          and supporting independent software. Get the most out of your subscription: explore pro
          features below or visit the{' '}
          <a href="https://foundry376.zendesk.com/hc/en-us/sections/115000521592-Getting-Started">
            Help Center
          </a>{' '}
          to learn more about reminders, templates, activity insights, and more.
          {unpaidNote}
        </div>
        <div className="feature-explore-title">Explore Mailspring Pro</div>
        <div className="feature-explore-grid">
          {ProTourFeatures.map(item => (
            <a key={item.title} className="feature" href={item.link}>
              <div className="popout">
                <RetinaImg name="thread-popout.png" mode={RetinaImg.Mode.ContentDark} />
              </div>
              <h3>
                <RetinaImg
                  name={item.icon}
                  style={{ paddingRight: 8 }}
                  mode={RetinaImg.Mode.ContentDark}
                />
                {item.title}
              </h3>
              <p>{item.text}</p>
            </a>
          ))}
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
