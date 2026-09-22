import React from 'react';
import { localized, Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

const OPEN_ICON = 'mailspring://open-tracking/assets/icon-composer-eye@2x.png';

export function ActivityFeedEmptyState({ hasTrackedMessages }: { hasTrackedMessages: boolean }) {
  return (
    <div className="activity-feed-empty-state">
      <RetinaImg
        className="logo"
        name="activity-list-empty.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
      <h3>
        {hasTrackedMessages
          ? localized('No opens or clicks yet')
          : localized('See who opens your email and clicks your links')}
      </h3>
      <p className="lead">
        {hasTrackedMessages
          ? localized(
              'Your tracked messages will show up here as soon as a recipient opens one or clicks a link.'
            )
          : localized(
              'Read receipts and link tracking are on by default for the messages you compose. Every open, click, and reply on a tracked message shows up here.'
            )}
      </p>
      <ol className="steps">
        <li>
          <span className="step-text">{localized('Compose a new message or reply.')}</span>
        </li>
        <li>
          <span className="step-text">{localized('Check that the read receipts icon')}</span>
          <span className="step-icon">
            <RetinaImg url={OPEN_ICON} mode={RetinaImg.Mode.ContentIsMask} />
          </span>
          <span className="step-text">{localized('and the link tracking icon')}</span>
          <span className="step-icon">
            <RetinaImg name="icon-composer-linktracking.png" mode={RetinaImg.Mode.ContentIsMask} />
          </span>
          <span className="step-text">
            {localized('in the composer toolbar are blue. Click either one to turn it on or off.')}
          </span>
        </li>
        <li>
          <span className="step-text">
            {localized(
              'Send it. Opens and clicks appear here, in the message itself, and as notifications.'
            )}
          </span>
        </li>
      </ol>
      <p className="hint">
        {localized(
          'Mailspring remembers the last setting you chose for new messages. Plain-text messages cannot be tracked, and free accounts include a limited number of tracked messages.'
        )}
      </p>
      <div className="btn btn-emphasis" onClick={() => Actions.composeNewBlankDraft()}>
        {localized('Compose a message')}
      </div>
    </div>
  );
}
ActivityFeedEmptyState.displayName = 'ActivityFeedEmptyState';
