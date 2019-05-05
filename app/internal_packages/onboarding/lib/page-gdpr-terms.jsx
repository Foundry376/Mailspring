import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';
const osLocale = require('os-locale');

const GDPR_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PO", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "IS", "LI",
  "NO", "CH",
  "CN", "US",
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
      gdpr_checks: [result, result]
    })
  }

  _renderCheckbox(check) {
    return (
      <RetinaImg
        name={check ? 'check.svg' : 'check-empty.svg'}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
        style={{ width: 21 }}
        className={check ? 'check' : 'empty'}
      />
    )
  }

  render() {
    const { isEU, gdpr_check_all, gdpr_checks } = this.state;
    const GDPR = (
      <div className="gdpr">
        <h1>We Care About Your Privacy</h1>
        <h4>
          Edison Mail respects your right to control data and we protect<br />
          your privacy, read how. In compliance with GDPR regulations,<br />
          please grant us the required permissions to process your data.<br />
          You can update them anytime.
        </h4>
        <div className="row check-all">
          <a onClick={this.toggleGDPRAll}>
            {this._renderCheckbox(gdpr_check_all)}
          </a>
          <div>
            Select All
          </div>
        </div>
        <div className="row">
          <a onClick={() => this.toggleCheckbox('gdpr_checks', 0)}>
            {this._renderCheckbox(gdpr_checks[0])}
          </a>
          <p>
            Access email accounts connected and process personal data to<br />
            use the smart features in the Edison Mail app.
          </p>
        </div>
        <div className="row">
          <a onClick={() => this.toggleCheckbox('gdpr_checks', 1)}>
            {this._renderCheckbox(gdpr_checks[1])}
          </a>
          <p>
            Process data as part of Edison Trends Research. We use the<br />
            information we collect to understand new and interesting<br />
            consumer trends. We may share these anonymized trends with<br />
            third parties outside Edison. Keep Email free!
          </p>
        </div>
      </div>);

    const Terms = (
      <div>Terms
      </div>);

    return (
      <div className={`page gdpr-terms`}>
        <img
          className="logo"
          src={`edisonmail://onboarding/assets/manage-privacy.png`}
          alt=""
        />
        {isEU ? GDPR : Terms}
      </div>
    );
  }
}

export default GdprTerms;
