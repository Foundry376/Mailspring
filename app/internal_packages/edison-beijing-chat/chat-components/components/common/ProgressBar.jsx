import React, { PureComponent } from 'react';
import CancelIcon from './icons/CancelIcon';
import path from 'path';
import { RetinaImg } from 'mailspring-component-kit';
import { ProgressBarStore, ChatActions } from 'chat-exports';

const remote = require('electron').remote;
const shell = remote.shell;

export default class ProgressBar extends PureComponent {
  constructor(props) {
    super(props);
  }

  hide = () => {
    let loading = ProgressBarStore.progress.loading;
    if (ProgressBarStore.progress.finished || ProgressBarStore.progress.failed) {
      loading = false;
    }
    ChatActions.updateProgress({ loading, visible: false });
  };

  viewDownload = () => {
    const { progress } = this.props;
    const { loadConfig } = progress;
    shell.showItemInFolder(loadConfig.filepath);
  };

  render() {
    const { progress, onCancel, onRetry } = this.props;
    const { loadConfig, percent, visible, failed, offline, loading, finished } = progress;

    if (!loadConfig || !visible) {
      return null;
    }

    let loadWord, loadText;
    const filename = path.basename(loadConfig.filepath);
    if (loadConfig.type === 'download') {
      loadWord = 'Downloading';
      loadText = 'was saved to your computer'
    } else {
      loadWord = 'Uploading';
      loadText = 'was uploaded to the web'
    }
    let status = '';
    if (failed) {
      status = '(failed)';
    }
    if (offline) {
      status = '(offline)';
    }
    return (<div className={'progress-container'}>
      <div className='progress-banner'>
        {(!finished) ? <RetinaImg className={'download-btn'}
                                  name={'download.svg'}
                                  isIcon
                                  mode={RetinaImg.Mode.ContentIsMask}/> :
          <RetinaImg className={'download-btn'}
                     name={'check-alone.svg'}
                     isIcon={true}
                     mode={RetinaImg.Mode.ContentIsMask}/>
        }

        <div className='load-info'>
          {!finished ? <div className={'progress-prompt'}>
              <span>{loadWord}:&nbsp;</span>
              <span>{filename}</span>
              <span>{status}</span>
            </div>:
            <div>{filename} {loadText}</div>
          }

          {!finished ? <div className='msg-progress-bar-wrap'>
            <div className='progress-background'/>
            <div className='progress-foreground' style={{
              backGroundColor: '#1b08ff',
              width: `${Math.min(percent, 100)}%`,
            }}/>
          </div>: null
          }
        </div>
        <div className='progressButtons'>
          {finished ?
            (loadConfig.type==='download' ?
              <div className='cancelButton' onClick={this.viewDownload}>View</div> :
              null) :
            ((!offline && failed) ? <div className='cancelButton' onClick={onRetry}>Retry</div> :
              <div className='cancelButton' onClick={onCancel}>Cancel</div>)
          }
          <CancelIcon color={'gray'} onClick={this.hide}></CancelIcon>
        </div>
        <div>

        </div>
      </div>
    </div>);
  }
}

