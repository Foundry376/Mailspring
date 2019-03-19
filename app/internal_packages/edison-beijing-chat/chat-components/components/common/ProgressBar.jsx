import React, { PureComponent } from 'react';
import CancelIcon from './icons/CancelIcon';

export default function ProgressBar(props) {
  const { percent, filename, onCancel, visible } = props;
  return (visible ?
      (<div className='progress-banner'>
        <div className={'progress-prompt'}>
          <span>Downloading:&nbsp;</span>
          <span>{filename}</span>
        </div>
        <div className='msg-progress-bar-wrap'>
          <div className="progress"  style={{backGroundColor: '#63a2ff',
            width: `${100-Math.min(percent, 100)}%`,
          }}/>
        </div>
        <div className='progressButtons' onClick={onCancel}>
          <div className='textButton'>cancel</div>
          <CancelIcon color={'gray'}></CancelIcon>
        </div>
      </div>) : null
  );
}
