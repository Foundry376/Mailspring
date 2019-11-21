import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import OnboardingActions from './onboarding-actions';
import { ipcRenderer } from 'electron';
import {
  Actions
} from 'mailspring-exports';

const CONFIG_KEY = 'shareCounts';
export default class SorryPage extends React.Component {
  static displayName = 'SorryPage';

  constructor(props) {
    super(props);
    this.state = {
      shareCounts: AppEnv.config.get(CONFIG_KEY) || 0
    }
  }

  componentDidMount() {
    require('electron').ipcRenderer.send('open-main-window-make-onboarding-on-top');
    this.disposable = AppEnv.config.onDidChange(CONFIG_KEY, () => {
      const shareCounts = AppEnv.config.get(CONFIG_KEY) || 0;
      AppEnv.getCurrentWindow().setAlwaysOnTop(true);
      if (shareCounts >= 5) {
        const mainWin = AppEnv.getMainWindow();
        if (mainWin) {
          console.log('*****close');
          mainWin.destroy();
        }
        OnboardingActions.moveToPage('gdpr-terms');
        return;
      } else {
        this.setState({
          shareCounts
        });
      }
    });
  }

  componentWillUnmount() {
    this.disposable.dispose();
  }

  _onContinue = () => {
    // AppEnv.getCurrentWindow().setAlwaysOnTop(false);
    ipcRenderer.send('command', 'application:send-share');
  };

  render() {
    return (
      <div className="page welcome">
        <div className="steps-container">
          <div>
            <p className="hero-text" style={{ fontSize: 46, marginTop: 257 }}>
              Sorry
            </p>
            <p>{5 - this.state.shareCounts}</p>
          </div>
        </div>
        <div className="footer">
          <button key="next" className="btn btn-large btn-continue" onClick={this._onContinue}>
            write email
          </button>
        </div>
      </div>
    );
  }
}
