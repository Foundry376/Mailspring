import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localizedReactFragment } from 'mailspring-exports';

const ActivityListEmptyState = function ActivityListEmptyState() {
  return (
    <div className="empty-state-container">
      <RetinaImg
        className="logo"
        name="activity-list-empty.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
      <div className="text">
        {localizedReactFragment(
          'Enable read receipts %@ or link tracking %@ to see notifications here.',
          <RetinaImg name="icon-activity-mailopen.png" mode={RetinaImg.Mode.ContentDark} />,
          <RetinaImg name="icon-activity-linkopen.png" mode={RetinaImg.Mode.ContentDark} />
        )}
      </div>
    </div>
  );
};

export default ActivityListEmptyState;
