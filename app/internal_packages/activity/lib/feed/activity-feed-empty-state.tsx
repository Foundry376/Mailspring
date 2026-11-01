import React from 'react';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

export function ActivityFeedEmptyState({ hasTrackedMessages }: { hasTrackedMessages: boolean }) {
  return (
    <div className="activity-feed-empty-state">
      <RetinaImg
        className="logo"
        name="activity-list-empty.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
      <h3>{localized('No historical read receipts')}</h3>
      <p className="lead">
        {hasTrackedMessages
          ? localized('No recorded opens match this time range.')
          : localized(
              'Read receipts from previously tracked messages appear here. New messages are not tracked.'
            )}
      </p>
    </div>
  );
}
ActivityFeedEmptyState.displayName = 'ActivityFeedEmptyState';
