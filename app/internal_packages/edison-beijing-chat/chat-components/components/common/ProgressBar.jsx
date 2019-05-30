import React, { PureComponent } from 'react';
import CancelIcon from './icons/CancelIcon';
import path from 'path';
import { RetinaImg } from 'mailspring-component-kit';
import chatModel from '../../store/model';

let key = 0;

export default class ProgressBar extends PureComponent {
  constructor(props) {
    super(props)
  }

  componentDidMount() {
    chatModel.progressBarData.bar = this;
  }

  update() {
    key++;
    const state = { key };
    this.setState(state);
  }

  hide = () => {
    chatModel.progressBarData.visible = false;
    this.update();
  }

  render() {
    const {progressBarData} = chatModel;
    console.log('progressBar.render: progressBarData: ', progressBarData);
    const { loadQueue, loadIndex, percent, visible, failed, offline, onCancel, onRetry } = progressBarData;

    if (!loadQueue || !visible) {
      return null;
    }

    const loadedConfigs = loadQueue.slice(0, loadIndex);
    const waitConfigs = loadQueue.slice(loadIndex + 1);
    const allFinished = loadIndex === loadQueue.length;
    let loadConfig, filename, loadWord;
    if (!allFinished) {
      loadConfig = loadQueue[loadIndex];
      filename = path.basename(loadConfig.filepath);
      if (loadConfig.type === 'download') {
        loadWord = 'Downloading'
      } else {
        loadWord = 'Uploading'
      }
    }
    let status = '';
    if (failed) {
      status = '(failed)'
    }
    if (offline) {
      status = '(offline)'
    }
    return (<div className={'progress-container'}>
      <div className='progress-banner'>
        <div>
          {loadedConfigs && loadedConfigs.map((loadConfig, index) => {
            let loadPrompt;
            if (loadConfig.type === 'download') {
              loadPrompt = ' was saved to your computer'
            } else {
              loadPrompt = ' was uploaded to the web'
            }
            const name = path.basename(loadConfig.filepath);
            return <p key={index}> {name} {loadPrompt}</p>
          })
          }
        </div>
        {(!allFinished) ? <div className={'progress-prompt'}>
          <span>{loadWord}:&nbsp;</span>
          <span>{filename}</span>
          <span>{status}</span>
        </div> : null}
        <RetinaImg className={'download-btn'}
                   name={'download.svg'}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
        {(!allFinished) ? <div className='msg-progress-bar-wrap'>
          <div className='progress-background'/>
          <div className='progress-foreground' style={{
            backGroundColor: '#1b08ff',
            width: `${Math.min(percent, 100)}%`,
          }}/>
        </div> : null
        }
        <div className='progressButtons'>
          {(!offline && failed) ? <div className='retryButton' onClick={onRetry}>Retry</div> : null}
          {(!allFinished) ? <div className='cancelButton' onClick={onCancel}>Cancel</div> : null}
          <CancelIcon color={'gray'} onClick={this.hide}></CancelIcon>
        </div>
        <div>
          {waitConfigs && waitConfigs.map((waitConfig, index) => {
            let waitPrompt;
            if (loadConfig.type === 'download') {
              waitPrompt = ' is waiting to save to your computer'
            } else {
              waitPrompt = ' is waiting to upload to the web'
            }
            const name = path.basename(waitConfig.filepath);
            return <p key={index}> {name} {waitPrompt}</p>
          })
          }
        </div>
      </div>
    </div>)
  }
}
