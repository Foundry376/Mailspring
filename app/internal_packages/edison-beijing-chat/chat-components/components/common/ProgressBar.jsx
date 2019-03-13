import React, { PureComponent } from 'react';

export default function ProgressBar(props) {
  const { percent } = props;
  return (
    <div className='progress-bar-wrap state-downloading'>
      <div className="progress-background" />
      <div className="progress-foreground" style={{
        width: `${Math.min(percent, 97.5)}%`,
      }} />
    </div>
  );
}
