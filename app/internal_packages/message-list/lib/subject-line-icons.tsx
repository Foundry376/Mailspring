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
      <div onClick={props.onToggleAllExpanded}>
        <RetinaImg
          name={props.hasCollapsedItems ? 'expand.png' : 'collapse.png'}
          title={props.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    )}
    <div onClick={props.onPrint}>
      <RetinaImg
        name="print.png"
        title={localized('Print Thread')}
        mode={RetinaImg.Mode.ContentIsMask}
      />
    </div>
    {AppEnv.isThreadWindow() ? (
      <div onClick={props.onPopIn}>
        <RetinaImg
          name="thread-popin.png"
          title={localized('Pop thread in')}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    ) : (
      <div onClick={props.onPopOut}>
        <RetinaImg
          name="thread-popout.png"
          title={localized('Popout thread')}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    )}
  </div>
);
