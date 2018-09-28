import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../common/Button';
import Loader from '../common/Loader';

export default class HomePage extends PureComponent {
  static propTypes = {
    isAuthenticating: PropTypes.bool.isRequired,
    submitAuth: PropTypes.func.isRequired
  }

  state = {
    jid: {
      value: '601081@im.edison.tech/macos',
      error: null
    },
    password: {
      value: 'JiUcDBzAR',
      error: null
    }
  }

  onEnterPress(event) {
    if (event.nativeEvent.keyCode === 13) {
      this.login();
    }
  }

  login() {
    const { jid: { value: jid }, password: { value: password } } = this.state;

    if (jid && password) {
      this.props.submitAuth(jid, password);
    } else {
      if (!jid) {
        const jidState = Object.assign({}, this.state.jid, {
          error: 'Required'
        });
        this.setState({
          jid: jidState
        });
      }
      if (!password) {
        const passwordState = Object.assign({}, this.state.password, {
          error: 'Required'
        });
        this.setState({
          password: passwordState
        });
      }
    }
  }

  onJidChanged(event) {
    const newValue = event.target.value;
    const jidState = Object.assign({}, this.state.jid, {
      value: newValue,
      error: null
    });
    this.setState({
      jid: jidState
    });
  }

  onPasswordChanged(event) {
    const newValue = event.target.value;
    const passwordState = Object.assign({}, this.state.passowrd, {
      value: newValue,
      error: null
    });
    this.setState({
      password: passwordState
    });
  }

  render() {
    return (
      <div className="chat-container">
        {this.props.isAuthenticating ?
          <Loader /> :
          <div className="authFormContainer">
            <div className="label">JID:</div>
            <input
              placeholder="e.g. 1234@128.0.0.7"
              onChange={this.onJidChanged.bind(this)}
              onKeyPress={this.onEnterPress.bind(this)}
              type="email"
              value={this.state.jid.value}
            />
            <div className="error">{this.state.jid.error}</div>
            <div className="label">Password:</div>
            <input
              placeholder="Password"
              onChange={this.onPasswordChanged.bind(this)}
              onKeyPress={this.onEnterPress.bind(this)}
              type="password"
              value={this.state.password.value}
            />
            <div className="error">{this.state.password.error}</div>
            <Button onTouchTap={this.login.bind(this)}>
              SUBMIT
            </Button>
          </div>
        }
      </div>
    );
  }
}
