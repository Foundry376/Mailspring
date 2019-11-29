import React from 'react';
import { ipcRenderer } from 'electron';
import uuid from 'uuid';
import { LottieImg } from 'mailspring-component-kit';
export default class BugReportRoot extends React.PureComponent {
  static displayName = 'BugReportRoot';
  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = {
      uploadLogs: true,
      uploadScreenShots: false,
      description: '',
      submitting: false,
      submitButtonText: 'Submit',
    };
    this.logID = '';
    this.mounted = false;
    this.minimizeTimeout = null;
    this.failSafeTimeout = null;
  }
  UNSAFE_componentWillMount() {
    AppEnv.setWindowTitle('Bug Report');
  }

  componentDidMount() {
    AppEnv.center();
    AppEnv.displayWindow();
    ipcRenderer.on('upload-to-report-server', this._onReportUploaded);
    this.mounted = true;
  }
  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.failSafeTimeout);
    clearTimeout(this.minimizeTimeout);
    ipcRenderer.removeListener('upload-to-report-server', this._onReportUploaded);
  }

  _onReportUploaded = (event, data) => {
    if(!this.mounted){
      return;
    }
    if (data.payload.logID === this.logID) {
      if (data.status === 'complete') {
        this.setState({ submitButtonText: 'Report Submitted' });
        if (this.failSafeTimeout) {
          clearTimeout(this.failSafeTimeout);
        }
        if (this.minimizeTimeout) {
          clearTimeout(this.minimizeTimeout);
        }
        setTimeout(() => {
          if (this.mounted) {
            AppEnv.close();
          }
        }, 2000);
      } else if (data.status === 'uploading') {
        this.setState({ submitButtonText: 'Uploading...' });
      } else {
        if(this.failSafeTimeout){
          clearTimeout(this.failSafeTimeout);
        }
        if (this.minimizeTimeout) {
          clearTimeout(this.minimizeTimeout);
        }
        AppEnv.displayWindow();
        this.setState({ submitting: false, submitButtonText: 'Try Again' });
        AppEnv.showErrorDialog({ title: 'Reporting bug failed', message: 'Uploading to server failed. Please try again'});
      }
    } else {
      console.log(`logID: ${this.logID}, data: ${data.payload.logID}`);
    }
  };

  onSubmit = () => {
    this.logID = uuid();
    let buttonText = 'Uploading...';
    if (this.state.uploadLogs) {
      buttonText = 'Generating Logs..';
    }
    this.setState({ submitting: true, submitButtonText: buttonText });
    AppEnv.reportError(
      new Error(this.state.description),
      { errorData: this.state.description, logID: this.logID },
      { grabLogs: this.state.uploadLogs }
    );
    clearTimeout(this.minimizeTimeout);
    this.minimizeTimeout = setTimeout(() => {
      if (this.mounted) {
        AppEnv.minimize();
      }
    }, 1500);
    clearTimeout(this.failSafeTimeout);
    this.failSafeTimeout = setTimeout(() => {
      if (this.mounted) {
        AppEnv.close();
      }
    }, 180000);
  };
  onToggleUploadLogs = () => {
    this.setState({ uploadLogs: !this.state.uploadLogs });
  };
  onToggleUploadScreenShots = () => {
    this.setState({ uploadScreenShots: !this.state.uploadScreenShots });
  };
  onDescriptionChange = event => {
    this.setState({ description: event.target.value });
  };
  renderSubmitButton() {
    if(!this.state.submitting){
      return <div>
        <button className="btn btn-large btn-report-bug" onClick={this.onSubmit}>
          {this.state.submitButtonText}
        </button>
      </div>
    }
    return <div>
      <button className="btn btn-large btn-report-bug">
        <LottieImg
          name="loading-spinner-white"
          size={{ width: 32, height: 32 }}
          style={{ marginRight: '12px', marginLeft: '-44px', display: 'inline-block', float: 'left' }}
        />
        {this.state.submitButtonText}</button>
    </div>
  }

  render() {
    return (
      <div className="page-frame bug-report">
        <h2>Thank you for helping Edison Mail</h2>
        <div className="item-field">
          <label>Please briefly describe your issue</label>
          <textarea
            disabled={this.state.submitting}
            value={this.state.description}
            placeholder="Briefly describe what you did, and what's the expected result and what was observed."
            onChange={this.onDescriptionChange}
          />
        </div>
        <div className="item-checkbox">
          <input
            type="checkbox"
            disabled={this.state.submitting}
            checked={this.state.uploadLogs}
            onChange={this.onToggleUploadLogs}
          />
          <label onClick={this.onToggleUploadLogs}>Include log files</label>
        </div>
        {/*<div className="item-checkbox">*/}
        {/*  <input*/}
        {/*    type="checkbox"*/}
        {/*    disabled={this.state.submitting}*/}
        {/*    checked={this.state.uploadScreenShots}*/}
        {/*    onChange={this.onToggleUploadScreenShots}*/}
        {/*  />*/}
        {/*  <label onClick={this.onToggleUploadScreenShots}>*/}
        {/*    Include app screenshot, this will ONLY include Edison Mail app screenshots.*/}
        {/*  </label>*/}
        {/*</div>*/}
        {this.renderSubmitButton()}
      </div>
    );
  }
}
