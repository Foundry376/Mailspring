import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

interface SubjectLineIconsProps {
  canCollapse: boolean;
  hasCollapsedItems: boolean;

  onPrint: () => void;
  onPopIn: () => void;
  onPopOut: () => void;
  onToggleAllExpanded: () => void;
}

export const SubjectLineIcons: React.FunctionComponent<SubjectLineIconsProps> = props => (
  <div className="message-icons-wrap">
    {props.canCollapse && (
      <div
        role="button"
        tabIndex={0}
        aria-label={props.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
        title={props.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
        onClick={props.onToggleAllExpanded}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onToggleAllExpanded();
          }
        }}
      >
        <RetinaImg
          name={props.hasCollapsedItems ? 'expand.png' : 'collapse.png'}
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </div>
    )}
    <div
      role="button"
      tabIndex={0}
      aria-label={localized('Print Thread')}
      title={localized('Print Thread')}
      onClick={props.onPrint}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPrint();
        }
      }}
    >
      <RetinaImg
        name="print.png"
        mode={RetinaImg.Mode.ContentIsMask}
        aria-hidden="true"
      />
    </div>
    {AppEnv.isThreadWindow() ? (
      <div
        role="button"
        tabIndex={0}
        aria-label={localized('Pop thread in')}
        title={localized('Pop thread in')}
        onClick={props.onPopIn}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onPopIn();
          }
        }}
      >
        <RetinaImg
          name="thread-popin.png"
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </div>
    ) : (
      <div
        role="button"
        tabIndex={0}
        aria-label={localized('Popout thread')}
        title={localized('Popout thread')}
        onClick={props.onPopOut}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onPopOut();
          }
        }}
      >
        <RetinaImg
          name="thread-popout.png"
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </div>
    )}
  </div>
);
