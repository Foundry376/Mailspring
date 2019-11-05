import React from 'react';
import PropTypes from 'prop-types';
import { Flexbox, RetinaImg } from 'mailspring-component-kit';

export class Privacy extends React.Component {
  static displayName = 'PreferencesPrivacy';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <div className="container-privacys">
        <Flexbox>
          <div className="config-group">
            <h6></h6>
            <div className="privacys-note">
              Safeguarding your privacy is important to all of us here at Edison Software. Read our
              privacy policy for important information about how we use and protect your data.
            </div>
            <div className="privacys-link">Privacy Policy</div>
            <div className="privacys-link">Terms & Conditions</div>
          </div>
          <RetinaImg
            name={'manage-privacy.png'}
            mode=""
            style={{ width: 200, height: 200, marginTop: 20 }}
          />
        </Flexbox>
        <div className="config-group">
          <h6>MANAGE YOUR DATA</h6>
          <div className="privacys-note">
            We respect and acknowledge your right to privacy. At any time, you can discontinue use
            of this app and delete the information that is in the app and on our servers.
          </div>
          <Flexbox>
            <div className="privacys-button">Export My Data</div>
          </Flexbox>
          <Flexbox>
            <div className="privacys-button">Delete Stored Data</div>
            <div className="privacys-button">Opt-out of Data Sharing</div>
          </Flexbox>
        </div>
      </div>
    );
  }
}
