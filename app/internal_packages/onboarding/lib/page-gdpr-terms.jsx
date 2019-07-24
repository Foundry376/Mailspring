import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';
import OnboardingActions from './onboarding-actions';
const osLocale = require('os-locale');

const GDPR_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PO", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "IS", "LI",
  "NO", "CH",
  // "CN", "US",
];

class GdprTerms extends Component {
  // eslint-disable-line
  static displayName = 'GdprTerms';

  static propTypes = {
    account: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = {
      isEU: this._isEuropeUser(),
      gdpr_check_all: false,
      gdpr_checks: [false, false],
      continueGDPR: false,
      terms_check_all: false,
      terms_error: false
    }
  }

  _isEuropeUser() {
    let locale = osLocale.sync();
    if (locale.indexOf('_') !== -1) {
      locale = locale.split('_')[1];
    }
    return GDPR_COUNTRIES.indexOf(locale) !== -1;
  }

  toggleGDPRAll = () => {
    const result = !this.state.gdpr_check_all;
    this.setState({
      gdpr_check_all: result,
      gdpr_checks: [result, result],
    })
  }

  toggleTerms = () => {
    this.setState({
      terms_check_all: !this.state.terms_check_all,
      terms_error: this.state.terms_check_all
    })
  }

  _renderCheckbox(check) {
    return (
      <RetinaImg
        name={check ? 'check.svg' : 'check-empty.svg'}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
        style={{ width: 24 }}
        className={check ? 'check' : 'empty'}
      />
    )
  }

  toggleCheckbox = (key, index, allCheckKey) => {
    this.state[key][index] = !this.state[key][index];
    const allCheck = this.state[key].indexOf(false) === -1;
    this.setState({
      [key]: this.state[key],
      [allCheckKey]: allCheck
    });
  }

  _onGDPRContinue = () => {
    if (!this.state.gdpr_check_all) {
      return;
    }
    this.setState({
      continueGDPR: true
    })
  }

  _onAgree = () => {
    if (!this.state.terms_check_all) {
      this.setState({
        terms_error: true
      })
      return;
    }
    AppEnv.config.set("agree", true);
    OnboardingActions.moveToPage('initial-preferences');
  }

  render() {
    const { isEU, gdpr_check_all, gdpr_checks, continueGDPR, terms_check_all, terms_error } = this.state;
    const GDPR = (
      <div className="gdpr">
        <h1>We Care About Your Privacy</h1>
        <h4>
          Edison Mail respects your right to control data and we protect<br />
          your privacy, <a href="http://www.edison.tech/privacy.html" target="_blank">read how</a>. In compliance with GDPR regulations,<br />
          please grant us the required permissions to process your data.<br />
          You can update them anytime.
        </h4>
        <div className="row check-all" onClick={this.toggleGDPRAll}>
          <a>
            {this._renderCheckbox(gdpr_check_all)}
          </a>
          <div>
            Select All
          </div>
        </div>
        <div className="row" onClick={() => this.toggleCheckbox('gdpr_checks', 0, 'gdpr_check_all')}>
          <a>
            {this._renderCheckbox(gdpr_checks[0])}
          </a>
          <div className="label">
            Access email accounts connected and process personal data to<br />
            use the smart features in the Edison Mail app.
          </div>
        </div>
        <div className="row" onClick={() => this.toggleCheckbox('gdpr_checks', 1, 'gdpr_check_all')}>
          <a>
            {this._renderCheckbox(gdpr_checks[1])}
          </a>
          <div className="label">
            Process data as part of Edison Trends Research. We use the<br />
            information we collect to understand new and interesting<br />
            consumer trends. We may share these anonymized trends with<br />
            third parties outside Edison. Keep Email free!
          </div>
        </div>
        <div className="footer">
          <button
            key="next"
            className={'btn btn-large btn-continue ' + (gdpr_check_all ? '' : 'btn-disabled')}
            onClick={this._onGDPRContinue}>
            Continue
          </button>
        </div>
      </div>);

    const Terms = (
      <div className="terms">
        <h1>Terms & Conditions</h1>
        <p className="these-terms-condition">
          These Terms & Conditions govern your use of the Edison Software (“Edison”)
          services and mobile applications. By accessing or using the Service, you signify
          that you have read, understood, and agree to be bound by this Terms &
          Conditions Agreement (“Agreement”), whether or not you are a registered user of
          our Service. We reserve the right to update this Agreement at any time. If we
          make any material changes to this Agreement, we will announce these changes
          on our Site and notify registered users via email. Your continued use of the
          Service after any such changes constitutes your acceptance of the new
          Agreement. If you do not agree to abide by these or any future Terms &
          Conditions, do not use or access the Service.
        </p>
        <div className="terms-links">
          <a href="http://www.edison.tech/terms.html" targe="_blank">
            View Terms & Conditions
          </a>
          <a href="http://www.edison.tech/privacy.html" targe="_blank">
            View Privacy Policy
          </a>
        </div>
        <div className="row terms-check" onClick={this.toggleTerms}>
          <a>
            {this._renderCheckbox(terms_check_all)}
          </a>
          <div className="label">
            I have read and agree to the Terms & Conditions
            {terms_error && (
              <div className="error">You must agree to the Terms & Conditions before continuing.</div>
            )}
          </div>
        </div>
        <div className="footer">
          <button
            key="agree"
            className={'btn btn-large btn-agree ' + (terms_check_all ? '' : 'btn-disabled')}
            onClick={this._onAgree}>
            Agree
          </button>
        </div>
      </div>);;

    return (
      <div className={`page gdpr-terms`}>
        <img
          className="logo"
          src={`edisonmail://onboarding/assets/manage-privacy.png`}
          alt=""
        />
        {isEU && !continueGDPR ? GDPR : Terms}
      </div>
    );
  }
}

export default GdprTerms;
