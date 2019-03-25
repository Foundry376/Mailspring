import React, { PureComponent } from 'react';
import CancelIcon from './icons/CancelIcon';
import path from 'path';

export default function ProgressBar(props) {
  const { progress, onCancel } = props;
  console.log('dbg*** ProgressBar: ', props);
  const { loadQueue, loadIndex, percent } = progress;
  const visible = loadQueue != null;
  if (!visible) {
    return null
  }
  const loadedConfigs = loadQueue.slice(0, loadIndex);
  const waitConfigs = loadQueue.slice(loadIndex+1);
  const allFinished = loadIndex === loadQueue.length;
  let loadConfig, filename, loadWord;
  if (!allFinished) {
    loadConfig = loadQueue[loadIndex];
    filename = path.basename(loadConfig.filepath);
    if (loadConfig.type==='download') {
      loadWord = 'Downloading'
    } else {
      loadWord = 'Uploading'
    }
  }
  return (<div className='progress-banner'>
    <div>
      {loadedConfigs && loadedConfigs.map((loadConfig, index) => {
        let loadPrompt;
        if (loadConfig.type==='download') {
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
    </div> : null}
    {(!allFinished) ? <div className='msg-progress-bar-wrap'>
      <div className='progress-background'/>
      <div className='progress-foreground' style={{
        backGroundColor: '#1b08ff',
        width: `${Math.min(percent, 100)}%`,
      }}/>
    </div> : null
    }
    <div className='progressButtons' onClick={onCancel}>
      {(!allFinished) ? <div className='textButton'>cancel</div> : null}
      <CancelIcon color={'gray'}></CancelIcon>
    </div>
    <div>
      {waitConfigs && waitConfigs.map((waitConfig, index) => {
        let waitPrompt;
        if (loadConfig.type==='download') {
          waitPrompt = ' is waiting to save to your computer'
        } else {
          waitPrompt = ' is waiting to upload to the web'
        }
        const name = path.basename(waitConfig.filepath);
        return <p key={index}> {name} {waitPrompt}</p>
      })
      }
    </div>
  </div>)
}
