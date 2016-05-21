import React from 'react';
import {RetinaImg} from 'nylas-component-kit';
import {Actions} from 'nylas-exports';

import OnboardingActions from '../onboarding-actions';
import AutofocusContainer from '../autofocus-container';
import {runAuthRequest} from '../account-helpers';
import ErrorMessage from '../error-message';
import AccountTypes from '../account-types'

const CreatePageForForm = (FormComponent) => {
  return class Composed extends React.Component {
    static displayName = FormComponent.displayName;

    static propTypes = {
      accountInfo: React.PropTypes.object,
    };

    constructor(props) {
      super(props);

      this.state = Object.assign({
        accountInfo: JSON.parse(JSON.stringify(this.props.accountInfo)),
        errorFieldNames: [],
        errorMessage: null,
      }, FormComponent.validateAccountInfo(this.props.accountInfo));
    }

    onFieldChange = (event) => {
      const changes = {};
      changes[event.target.id] = event.target.value;

      const accountInfo = Object.assign({}, this.state.accountInfo, changes);
      const {errorFieldNames, errorMessage, populated} = FormComponent.validateAccountInfo(accountInfo);

      this.setState({accountInfo, errorFieldNames, errorMessage, populated});
    }

    onFieldKeyPress = (event) => {
      if (['Enter', 'Return'].includes(event.key)) {
        this.refs.form.submit();
      }
    }

    onBack = () => {
      OnboardingActions.setAccountInfo(this.state.accountInfo);
      OnboardingActions.moveToPreviousPage();
    }

    onConnect = () => {
      this.setState({subitting: true});

      runAuthRequest(this.state.accountInfo)
      .then((json) => {
        OnboardingActions.accountJSONReceived(json)
      })
      .catch((err) => {
        Actions.recordUserEvent('Auth Failed', {
          errorMessage: err.message,
          provider: this.state.accountInfo.type,
        })

        const errorFieldNames = err.body ? (err.body.missing_fields || err.body.missing_settings) : []
        let errorMessage = null;

        if (err.errorTitle === "setting_update_error") {
          errorMessage = 'The IMAP/SMTP servers for this account do not match our records. Please verify that any server names you entered are correct. If your IMAP/SMTP server has changed, first remove this account from N1, then try logging in again.';
        }
        if (err.statusCode === -123) { // timeout
          errorMessage = "Request timed out. Please try again."
        }

        this.setState({errorMessage, errorFieldNames});
      });
    }

    _renderButton() {
      const {accountInfo, submitting, errorFieldNames, populated} = this.state;
      const buttonLabel = FormComponent.submitLabel(accountInfo);

      // We're not on the last page.
      if (submitting) {
        return (
          <button className="btn btn-large btn-disabled btn-add-account spinning">
            <RetinaImg name="sending-spinner.gif" width={15} height={15} mode={RetinaImg.Mode.ContentPreserve} />
            Adding account&hellip;
          </button>
        );
      }

      if (errorFieldNames.length || !populated) {
        return (
          <button className="btn btn-large btn-gradient btn-disabled btn-add-account">{buttonLabel}</button>
        );
      }

      return (
        <button className="btn btn-large btn-gradient btn-add-account" onClick={() => this.refs.form.submit()}>{buttonLabel}</button>
      );
    }

    render() {
      const {accountInfo, errorMessage, errorFieldNames, submitting} = this.state;
      const AccountType = AccountTypes.find(a => a.type === accountInfo.type);

      if (!AccountType) {
        throw new Error(`Cannot find account type ${accountInfo.type}`);
      }

      return (
        <div className={`page account-setup ${FormComponent.displayName}`}>
          <div className="logo-container">
            <RetinaImg
              style={{backgroundColor: AccountType.color, borderRadius: 44}}
              name={AccountType.headerIcon}
              mode={RetinaImg.Mode.ContentPreserve}
              className="logo"
            />
          </div>
          <h2>
            {FormComponent.titleLabel(AccountType)}
          </h2>
          <ErrorMessage
            message={errorMessage}
            empty={FormComponent.subtitleLabel(AccountType)}
          />
          <AutofocusContainer>
            <FormComponent
              ref="form"
              accountInfo={accountInfo}
              errorFieldNames={errorFieldNames}
              submitting={submitting}
              onFieldChange={this.onFieldChange}
              onFieldKeyPress={this.onFieldKeyPress}
              onConnect={this.onConnect}
            />
          </AutofocusContainer>
          <div>
            <div className="btn btn-large btn-gradient" onClick={this.onBack}>Back</div>
            {this._renderButton()}
          </div>
        </div>
      );
    }
  }
}

export default CreatePageForForm;
