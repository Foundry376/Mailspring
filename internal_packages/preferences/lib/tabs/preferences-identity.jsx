import React from 'react';
import {Actions, NylasAPI, IdentityStore} from 'nylas-exports';
import {RetinaImg} from 'nylas-component-kit';

class OpenIdentityPageButton extends React.Component {
  static propTypes = {
    destination: React.PropTypes.string,
    label: React.PropTypes.string,
    img: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
    };
  }

  _onClick = () => {
    this.setState({loading: true});
    const identity = IdentityStore.identity();
    if (!identity) { return }
    NylasAPI.navigateToBillingSite()
    .then(() => {
      this.setState({loading: false})
    })
  }

  render() {
    if (this.state.loading) {
      return (
        <div className="btn btn-disabled">
          <RetinaImg name="sending-spinner.gif" width={15} height={15} mode={RetinaImg.Mode.ContentPreserve} />
          &nbsp;{this.props.label}&hellip;
        </div>
      );
    }
    if (this.props.img) {
      return (
        <div className="btn">
          <RetinaImg name={this.props.img} mode={RetinaImg.Mode.ContentPreserve} />
          &nbsp;&nbsp;{this.props.label}
        </div>
      )
    }
    return (
      <div className="btn" onClick={this._onClick}>{this.props.label}</div>
    );
  }
}

class PreferencesIdentity extends React.Component {
  static displayName = 'PreferencesIdentity';

  constructor() {
    super();
    this.state = this.getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribe = IdentityStore.listen(() => {
      this.setState(this.getStateFromStores());
    });
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  getStateFromStores() {
    return {
      identity: IdentityStore.identity(),
      trialDaysRemaining: IdentityStore.trialDaysRemaining(),
    };
  }

  render() {
    const {identity, trialDaysRemaining} = this.state
    const {firstname, lastname, email} = identity
    return (
      <div className="container-identity">
        <div className="id-header">Nylas ID:</div>
        <div className="identity-content-box">
          <div className="row info-row">
            <div className="logo">
              <RetinaImg
                name="prefs-identity-nylas-logo.png"
                mode={RetinaImg.Mode.ContentPreserve}
              />
            </div>
            <div className="identity-info">
              <div className="name">{firstname} {lastname}</div>
              <div className="email">{email}</div>
              <div className="identity-actions">
                <OpenIdentityPageButton label="Account Details" destination="/billing" />
                <div className="btn" onClick={() => Actions.logoutNylasIdentity()}>Sign Out</div>
              </div>
            </div>
          </div>
          <div className="row trial-row">
            <div>There are {trialDaysRemaining} days remaining in your trial of Nylas N1</div>
            <OpenIdentityPageButton
              img="ic-upgrade.png"
              label="Upgrade to Nylas Pro"
              destination="/billing"
            />
          </div>
        </div>
      </div>
    );
  }
}

export default PreferencesIdentity;
