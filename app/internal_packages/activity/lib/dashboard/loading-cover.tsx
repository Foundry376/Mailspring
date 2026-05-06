import React from 'react';

import { RetinaImg } from 'mailspring-component-kit';

export default class LoadingCover extends React.Component<{ active: boolean }> {
  render() {
    return (
      <div className={`loading-cover ${this.props.active && 'active'}`}>
        <div className="loading-indicator">
          <RetinaImg name="activity-loading-mask.png" mode={RetinaImg.Mode.ContentIsMask} />
        </div>
      </div>
    );
  }
}
