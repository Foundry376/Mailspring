import React from 'react';
import {
  localized,
  IdentityStore,
  Contact,
  FeatureUsageStore,
  PropTypes,
  DOMUtils,
  RegExpUtils,
  Thread,
  Utils,
} from 'mailspring-exports';
import { RetinaImg, ContactProfilePhoto } from 'mailspring-component-kit';
import moment from 'moment-timezone';

import ParticipantProfileDataSource from './participant-profile-data-source';

class TimeInTimezone extends React.Component<{ timeZone: string }, { tick: number }> {
  constructor(props) {
    super(props);
    this.state = { tick: 0 };
  }

  _timer: NodeJS.Timer;

  componentDidMount() {
    this.scheduleTick();
  }

  componentWillUnmount() {
    if (this._timer) clearInterval(this._timer);
  }

  scheduleTick = () => {
    // schedules for the next minute change each minute
    this._timer = setTimeout(() => {
      this.setState({ tick: this.state.tick + 1 }, this.scheduleTick);
    }, 60000 - (Date.now() % 60000));
  };

  render() {
    return (
      <strong>
        {`Currently ${moment()
          .tz(this.props.timeZone)
          .format('h:mma')}`}
      </strong>
    );
  }
}

class SocialProfileLink extends React.Component<{
  handle: string;
  service: string;
  hostname: string;
}> {
  static propTypes = {
    service: PropTypes.string,
    handle: PropTypes.string,
    hostname: PropTypes.string,
  };

  render() {
    const { handle, service, hostname } = this.props;

    if (!handle) {
      return false;
    }
    return (
      <a
        className="social-profile-item"
        title={`https://${hostname}/${handle}`}
        href={`https://${hostname}/${handle}`}
      >
        <RetinaImg
          url={`mailspring://participant-profile/assets/${service}-sidebar-icon@2x.png`}
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </a>
    );
  }
}

class TextBlockWithAutolinkedElements extends React.Component<{ text: string; className: string }> {
  static propTypes = {
    className: PropTypes.string,
    text: PropTypes.string,
  };

  render() {
    if (!this.props.text) {
      return false;
    }

    const nodes = [];
    const hashtagOrMentionRegex = RegExpUtils.hashtagOrMentionRegex();

    let remainder = this.props.text;
    let match = null;
    let count = 0;

    while ((match = hashtagOrMentionRegex.exec(remainder))) {
      // the first char of the match is whitespace, match[1] is # or @, match[2] is the tag itself.
      nodes.push(remainder.substr(0, match.index + 1));
      if (match[1] === '#') {
        nodes.push(
          <a key={count} href={`https://twitter.com/hashtag/${match[2]}`}>{`#${match[2]}`}</a>
        );
      }
      if (match[1] === '@') {
        nodes.push(<a key={count} href={`https://twitter.com/${match[2]}`}>{`@${match[2]}`}</a>);
      }
      remainder = remainder.substr(match.index + match[0].length);
      count += 1;
    }
    nodes.push(remainder);

    return <p className={`selectable ${this.props.className}`}>{nodes}</p>;
  }
}

class IconRow extends React.Component<{ node: React.ReactChild; icon: string }> {
  static propTypes = {
    node: PropTypes.node,
    icon: PropTypes.string,
  };

  render() {
    const { node, icon } = this.props;

    if (!node) {
      return false;
    }
    return (
      <div className={`icon-row ${icon}`}>
        <RetinaImg
          url={`mailspring://participant-profile/assets/${icon}-icon@2x.png`}
          mode={RetinaImg.Mode.ContentPreserve}
          style={{ float: 'left' }}
        />
        <span className="selectable" style={{ display: 'block', marginLeft: 25 }}>
          {node}
        </span>
      </div>
    );
  }
}

class LocationRow extends React.Component<{ location: string }> {
  static propTypes = {
    location: PropTypes.string,
  };

  render() {
    return (
      <IconRow
        icon="location"
        node={
          this.props.location && (
            <span>
              {this.props.location}
              {' ['}
              <a className="plain" href={`https://maps.google.com/?q=${this.props.location}`}>
                View
              </a>
              {']'}
            </span>
          )
        }
      />
    );
  }
}

interface SidebarParticipantProfileProps {
  contact: Contact;
}

interface SidebarParticipantProfileState {
  trialing: boolean;
  loading: boolean;
  loaded: boolean;
  avatar?: string;
  company?: ICompany;
  person?: IPerson;
}

interface ICompany {
  name: string;
  domain: string;
  category?: {
    industry?: string;
    sector?: string;
  };
  description: string;
  location: string;
  timeZone: string;
  logo: string;
  facebook?: { handle: string };
  twitter?: { handle: string };
  linkedin?: { handle: string };
  crunchbase?: { handle: string };
  type: string;
  ticker: string;
  phone: string;
  metrics: {
    raised?: string;
    marketCap?: string;
    employees?: string;
    employeesRange?: string;
  };
}

interface IPerson {
  facebook?: { handle: string };
  twitter?: { handle: string };
  linkedin?: { handle: string };
  employment?: {
    title: string;
    name: string;
  };
  location?: string;
  bio?: string;
}

export default class SidebarParticipantProfile extends React.Component<
  SidebarParticipantProfileProps,
  SidebarParticipantProfileState
> {
  static displayName = 'SidebarParticipantProfile';

  static propTypes = {
    contact: PropTypes.object,
  };

  static containerStyles = {
    order: 0,
  };

  _mounted: boolean = false;

  state: SidebarParticipantProfileState = {
    trialing: !IdentityStore.hasProFeatures(),
    loading: IdentityStore.hasProFeatures(),
    loaded: false,
  };

  constructor(props) {
    super(props);

    const contactState = ParticipantProfileDataSource.getCache(props.contact.email);
    if (contactState) {
      this.state = Object.assign(this.state, { loaded: true }, contactState);
    }
  }

  componentDidMount() {
    this._mounted = true;

    if (this.state.loading) {
      // Wait until we know they've "settled" on this email to reduce the number of
      // requests to the contact search endpoint.
      setTimeout(this._onFindContact, 2000);
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _onClickedToTry = async () => {
    try {
      await FeatureUsageStore.markUsedOrUpgrade('contact-profiles', {
        headerText: localized('All Contact Previews Used'),
        rechargeText: `${localized(
          `You can view contact profiles for %1$@ emails each %2$@ with Mailspring Basic.`
        )} ${localized('Upgrade to Pro today!')}`,
        iconUrl: 'mailspring://participant-profile/assets/ic-contact-profile-modal@2x.png',
      });
    } catch (err) {
      // user does not have access to this feature
      return;
    }
    this._onFindContact();
  };

  _onFindContact = async () => {
    if (!this._mounted) {
      return;
    }
    if (!this.state.loading) {
      this.setState({ loading: true });
    }
    ParticipantProfileDataSource.find(this.props.contact).then(result => {
      if (!this._mounted) {
        return;
      }
      this.setState(Object.assign({ loading: false, loaded: true }, result));
    });
  };

  _onSelect = event => {
    const el = event.target;
    const sel = document.getSelection();
    if (el.contains(sel.anchorNode) && !sel.isCollapsed) {
      return;
    }
    const anchor = DOMUtils.findFirstTextNode(el);
    const focus = DOMUtils.findLastTextNode(el);
    if (anchor && focus && focus.data) {
      sel.setBaseAndExtent(anchor, 0, focus, focus.data.length);
    }
  };

  _renderFindCTA() {
    if (!this.state.trialing || this.state.loaded) {
      return;
    }
    if (!this.props.contact.email || Utils.likelyNonHumanEmail(this.props.contact.email)) {
      return;
    }

    return (
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <p>
          {localized(
            `The contact sidebar in Mailspring Pro shows information about the people and companies you're emailing with.`
          )}
        </p>
        <div className="btn" onClick={!this.state.loading ? this._onClickedToTry : null}>
          {!this.state.loading ? localized(`Try it Now`) : localized(`Loading...`)}
        </div>
      </div>
    );
  }

  _renderCompanyInfo() {
    if (!this.state.company || !this.state.company.name) {
      return;
    }

    const {
      name,
      domain,
      category,
      description,
      location,
      timeZone,
      logo,
      facebook,
      twitter,
      linkedin,
      crunchbase,
      type,
      ticker,
      phone,
      metrics,
    } = this.state.company;

    let employees = null;
    let funding = null;

    if (metrics) {
      if (metrics.raised) {
        funding = `${localized(`Raised`)} ${(Number(metrics.raised) || 0).toLocaleString()}`;
      } else if (metrics.marketCap) {
        funding = `${localized(`Market Cap`)} $${(
          Number(metrics.marketCap) || 0
        ).toLocaleString()}`;
      }

      if (metrics.employees) {
        employees = `${(Number(metrics.employees) || 0).toLocaleString()} ${localized(
          `employees`
        )}`;
      } else if (metrics.employeesRange) {
        employees = `${metrics.employeesRange} ${localized(`employees`)}`;
      }
    }

    return (
      <div className="company-profile">
        {logo && (
          <RetinaImg url={logo} className="company-logo" mode={RetinaImg.Mode.ContentPreserve} />
        )}

        <div className="selectable larger" onClick={this._onSelect}>
          {name}
        </div>

        {domain && (
          <a className="domain" href={domain.startsWith('http') ? domain : `http://${domain}`}>
            {domain}
          </a>
        )}

        <div className="additional-info">
          <TextBlockWithAutolinkedElements text={description} className="description" />
          <LocationRow location={location} />
          <IconRow
            icon="timezone"
            node={
              timeZone && (
                <span>
                  {`${timeZone.replace('_', ' ')} - `}
                  <TimeInTimezone timeZone={timeZone} />
                </span>
              )
            }
          />
          <IconRow icon="industry" node={category && (category.industry || category.sector)} />
          <IconRow
            icon="holding"
            node={
              {
                private: localized('Privately Held'),
                public: localized(`Stock Symbol %@`, ticker),
              }[type]
            }
          />
          <IconRow icon="phone" node={phone} />
          <IconRow icon="employees" node={employees} />
          <IconRow icon="funding" node={funding} />

          <div className="social-profiles-wrap">
            <SocialProfileLink
              service="facebook"
              hostname="www.facebook.com"
              handle={facebook && facebook.handle}
            />
            <SocialProfileLink
              service="crunchbase"
              hostname="www.crunchbase.com"
              handle={crunchbase && crunchbase.handle}
            />
            <SocialProfileLink
              service="linkedin"
              hostname="www.linkedin.com"
              handle={linkedin && linkedin.handle}
            />
            <SocialProfileLink
              service="twitter"
              hostname="twitter.com"
              handle={twitter && twitter.handle}
            />
          </div>
        </div>
      </div>
    );
  }

  _renderPersonInfo() {
    const { facebook, linkedin, twitter, employment, location, bio } =
      this.state.person || ({} as IPerson);

    return (
      <div className="participant-profile">
        <ContactProfilePhoto
          loading={this.state.loading}
          avatar={this.state.avatar}
          contact={this.props.contact}
        />
        <div className="personal-info">
          {this.props.contact.fullName() !== this.props.contact.email && (
            <div className="selectable larger" onClick={this._onSelect}>
              {this.props.contact.fullName()}
            </div>
          )}

          {employment && (
            <div className="selectable current-job">
              {employment.title && <span>{employment.title},&nbsp;</span>}
              {employment.name}
            </div>
          )}

          <div className="selectable email" onClick={this._onSelect}>
            {this.props.contact.email}
          </div>

          <div className="social-profiles-wrap">
            <SocialProfileLink
              service="facebook"
              hostname="www.facebook.com"
              handle={facebook && facebook.handle}
            />
            <SocialProfileLink
              service="linkedin"
              hostname="www.linkedin.com"
              handle={linkedin && `in/${linkedin.handle}`}
            />
            <SocialProfileLink
              service="twitter"
              hostname="twitter.com"
              handle={twitter && twitter.handle}
            />
          </div>
        </div>

        <div className="additional-info">
          <TextBlockWithAutolinkedElements text={bio} className="bio" />
          <LocationRow location={location} />
        </div>
      </div>
    );
  }

  render() {
    return (
      <div>
        {this._renderPersonInfo()}

        {this._renderCompanyInfo()}

        {this._renderFindCTA()}
      </div>
    );
  }
}
