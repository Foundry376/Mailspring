import React from 'react';
import PropTypes from 'prop-types';
import { Flexbox, RetinaImg, LottieImg } from 'mailspring-component-kit';
import { Actions, Utils, TaskQueue, SiftExpungeUserDataTask } from 'mailspring-exports';
import rimraf from 'rimraf';

export class Privacy extends React.Component {
  static displayName = 'PreferencesPrivacy';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };
  constructor(props) {
    super(props);
    this.state = {
      deleteUserDataPopupOpen: false,
      deletingUserData: false,
    };
    this._mounted = false;
    this._expungeUserDataTimout = null;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._expungeUserDataTimout) {
      clearTimeout(this._expungeUserDataTimout);
    }
  }

  renderExportData() {
    // if (Utils.needGDPR()) {
    //   return <Flexbox>
    //     <div className="btn-danger privacys-button">Export My Data</div>
    //   </Flexbox>;
    // } else {
    return null;
    // }
  }

  expungeLocalAndReboot() {
    if (this._mounted) {
      this.setState({ deletingUserData: false });
    }
    rimraf(AppEnv.getConfigDirPath(), { disableGlob: true }, err => {
      if (err) {
        return AppEnv.showErrorDialog(
          `Could not reset accounts and settings. Please delete the folder ${AppEnv.getConfigDirPath()} manually.\n\n${err.toString()}`
        );
      }
      const app = require('electron').remote.app;
      app.relaunch();
      app.quit();
    });
  }

  openDeleteUserDataConfirmationPage = () => {
    this.setState({ deleteUserDataPopupOpen: true });
    AppEnv.showMessageBox({
      title: 'Are you sure?',
      detail:
        'By deleting your data on our servers, you are also discontinuing your use of the Email application. This action cannot be undon. ',
      showInMainWindow: true,
      buttons: ['Confirm', 'Cancel'],
    }).then(({ response }) => {
      if (this._mounted) {
        this.setState({ deleteUserDataPopupOpen: false });
      }
      if (response === 0) {
        this.setState({ deletingUserData: true }, () => {
          const task = new SiftExpungeUserDataTask();
          Actions.queueTask(task);
          TaskQueue.waitForPerformRemote(task)
            .then(() => {
              this.expungeLocalAndReboot();
            })
            .catch(() => {
              AppEnv.showErrorDialog({
                title: 'Delete data failed.',
                message: 'Expunging data from remote server failed, Please try again',
              });
            });
        });
      }
    });
  };

  renderDeleteUserData() {
    if (this.state.deleteUserDataPopupOpen || this.state.deletingUserData) {
      return (
        <div className="btn-danger privacys-button">{this.renderSpinner()}Delete Stored Data</div>
      );
    }
    return (
      <div className="btn-danger privacys-button" onClick={this.openDeleteUserDataConfirmationPage}>
        Delete Stored Data
      </div>
    );
  }

  toggleDataShare = () => {
    const optOut = AppEnv.config.get('core.privacy.dataShare.optOut');
    AppEnv.config.set('core.privacy.dataShare.optOut', !optOut);
    Actions.dataShareOptions({ optOut: !optOut });
  };

  renderDataShareOption() {
    if (this.state.deleteUserDataPopupOpen || this.state.deletingUserData) {
      return (
        <div className="btn-danger privacys-button">
          {this.renderSpinner()}Opt-out of Data Sharing
        </div>
      );
    }
    if (AppEnv.config.get('core.privacy.dataShare.optOut')) {
      return (
        <div className="btn-primary privacys-button" onClick={this.toggleDataShare}>
          Opt-in of Data Sharing
        </div>
      );
    } else {
      return (
        <div className="btn-danger privacys-button" onClick={this.toggleDataShare}>
          Opt-out of Data Sharing
        </div>
      );
    }
  }

  renderSpinner() {
    return (
      <LottieImg
        name="loading-spinner-blue"
        size={{ width: 24, height: 24 }}
        style={{ margin: 'none' }}
      />
    );
  }

  render() {
    return (
      <div className="container-privacys">
        <Flexbox>
          <div className="config-group">
            <h6>POLICY & TERMS</h6>
            <div className="privacys-note">
              Safeguarding your privacy is important to all of us here at Edison Software. Read our
              privacy policy for important information about how we use and protect your data.
            </div>
            <div className="privacys-link">
              <a href="http://www.edison.tech/privacy.html">Privacy Policy</a>
            </div>
            <div className="privacys-link">
              <a href="http://www.edison.tech/terms.html">Terms & Conditions</a>
            </div>
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
          {this.renderExportData()}
          <Flexbox>
            {this.renderDeleteUserData()}
            {this.renderDataShareOption()}
          </Flexbox>
        </div>
      </div>
    );
  }
}
