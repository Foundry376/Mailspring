import React, { PureComponent } from 'react';
import CancelIcon from './icons/CancelIcon';

export default function ProgressBar(props) {
  const { progress, onCancel } = props;
  const { savedFiles, downQueue, percent, filename, visible } = progress;
  return (visible ?
      (<div className='progress-banner'>
        <div>
          {savedFiles && savedFiles.map((name, index) => <p key={index}> {name} was saved to your computer</p>)
          }
        </div>
        {(downQueue && downQueue.length)? <div className={'progress-prompt'}>
          <span>Downloading:&nbsp;</span>
          <span>{filename}</span>
        </div>: null}
        {(downQueue && downQueue.length)? <div className='msg-progress-bar-wrap'>
          <div className='progress-background'/>
          <div className='progress-foreground' style={{
            backGroundColor: '#1b08ff',
            width: `${Math.min(percent, 100)}%`,
          }}/>
        </div>:null
        }
        <div className='progressButtons' onClick={onCancel}>
          {(downQueue && downQueue.length)? <div className='textButton'>cancel</div>:null}
          <CancelIcon color={'gray'}></CancelIcon>
        </div>
      </div>) : null
  );
}
