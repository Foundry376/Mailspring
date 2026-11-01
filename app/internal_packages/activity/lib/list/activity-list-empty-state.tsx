import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

const ActivityListEmptyState = function ActivityListEmptyState() {
  return (
    <div className="empty-state-container">
      <RetinaImg
        className="logo"
        name="activity-list-empty.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
      <div className="text">{localized('No historical read receipt activity.')}</div>
    </div>
  );
};

export default ActivityListEmptyState;
