import React from 'react';

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
    };
  }
  UNSAFE_componentWillMount() {
    AppEnv.setWindowTitle('Bug Report');
  }

  componentDidMount() {
    AppEnv.center();
    AppEnv.displayWindow();
  }

  onSubmit = () => {
    this.setState({ submitting: true });
    const promises = [];
    const files = [];
    if (this.state.uploadLogs) {
      promises.push(AppEnv.grabLogs('User-Bug-Report'));
    }
    if (this.state.uploadScreenShots) {
      promises.push(AppEnv.captureScreen());
    }
    if (promises.length > 0) {
      Promise.all(promises)
        .then(values => {
          for (let i = 0; i < values.length; i++) {
            if (values[i].length > 0) {
              files.push(values[i]);
            }
          }
          AppEnv.reportError({}, { errorData: this.state.description, files: files });
          AppEnv.close();
        })
        .catch(e => {
          console.error('error file');
          AppEnv.reportError(e, {
            errorData: { message: 'upload error file failed', description: this.state.description },
          });
          AppEnv.close();
        });
    } else {
      AppEnv.reportError({}, { errorData: this.state.description });
      AppEnv.close();
    }
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
        <div className="item-checkbox">
          <input
            type="checkbox"
            disabled={this.state.submitting}
            checked={this.state.uploadScreenShots}
            onChange={this.onToggleUploadScreenShots}
          />
          <label onClick={this.onToggleUploadScreenShots}>
            Include app screenshot, this will ONLY include Edison Mail app screenshots.
          </label>
        </div>
        <div>
          <button className="btn btn-large btn-report-bug" onClick={this.onSubmit}>
            Submit
          </button>
        </div>
      </div>
    );
  }
}
