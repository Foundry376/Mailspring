import React from 'react';
import {shell} from 'electron';
import {RetinaImg} from 'nylas-component-kit';
import {IdentityStore} from 'nylas-exports';
import request from 'request';

class OpenIdentityPageButton extends React.Component {
  static propTypes = {
    destination: React.PropTypes.string,
    label: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
    };
  }

  _onClick = () => {
    const identity = IdentityStore.identity();
    if (!identity) {
      return;
    }

    if (!this.props.destination.startsWith('/')) {
      throw new Error("destination must start with a leading slash.");
    }

    this.setState({loading: true});

    request({
      method: 'POST',
      url: `${IdentityStore.URLRoot}/n1/login-link`,
      json: true,
      body: {
        destination: this.props.destination,
        account_token: identity.token,
      },
    }, (error, response = {}, body) => {
      this.setState({loading: false});
      if (error || !body.startsWith('http')) {
        // Single-sign on attempt failed. Rather than churn the user right here,
        // at least try to open the page directly in the browser.
        shell.openExternal(`${IdentityStore.URLRoot}${this.props.destination}`);
      } else {
        shell.openExternal(body);
      }
    });
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
    };
  }

  render() {
    return (
      <div className="container-identity">
        <div className="identity-content">
          {JSON.stringify(this.state.identity)}
          <OpenIdentityPageButton label="Go to web" destination="/billing" />
        </div>
      </div>
    );
  }

}

export default PreferencesIdentity;
