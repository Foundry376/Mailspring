import React from 'react';
import { RetinaImg } from './retina-img';
import { Label } from 'mailspring-exports';

type MailLabelProps = {
  label: {
    id?: string;
    displayName: React.ReactElement | string;
    isLockedCategory: () => boolean;
    hue: () => number;
  };
  onRemove?: (...args: any[]) => any;
};

export const LabelColorizer = {
  color(label) {
    return `hsl(${label.hue()}, 50%, 34%)`;
  },

  backgroundColor(label) {
    return `hsl(${label.hue()}, 62%, 87%)`;
  },

  backgroundColorDark(label) {
    return `hsl(${label.hue()}, 62%, 57%)`;
  },

  styles(label) {
    const styles: any = {
      color: LabelColorizer.color(label),
      backgroundColor: LabelColorizer.backgroundColor(label),
      boxShadow: `inset 0 0 1px hsl(${label.hue()}, 62%, 47%), inset 0 1px 1px rgba(255,255,255,0.5), 0 0.5px 0 rgba(255,255,255,0.5)`,
    };
    if (process.platform !== 'win32') {
      styles.backgroundImage = 'linear-gradient(rgba(255,255,255, 0.4), rgba(255,255,255,0))';
    }
    return styles;
  },
};

export const MailLabel: React.FC<MailLabelProps> = React.memo(
  ({ label, onRemove }) => {
    const removable = onRemove && !label.isLockedCategory();
    let classname = 'mail-label';
    let content: JSX.Element | string = label.displayName;

    let x: JSX.Element | null = null;
    if (removable) {
      classname += ' removable';
      content = <span className="inner">{content}</span>;
      x = (
        <RetinaImg
          className="x"
          name="label-x.png"
          style={{ backgroundColor: LabelColorizer.color(label) }}
          mode={RetinaImg.Mode.ContentIsMask}
          onClick={onRemove}
        />
      );
    }

    return (
      <div className={classname} style={LabelColorizer.styles(label)}>
        {content}
        {x}
      </div>
    );
  },
  (prev, next) => prev.label.id === next.label.id
);
MailLabel.displayName = 'MailLabel';
