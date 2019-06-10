import React from 'react';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

export const QuotedTextControl: React.FunctionComponent<{
  quotedTextPresent: boolean;
  quotedTextHidden: boolean;
  onUnhide: () => void;
  onRemove: () => void;
}> = props => {
  if (!props.quotedTextPresent || !props.quotedTextHidden) {
    return null;
  }
  return (
    <a
      className="quoted-text-control"
      onMouseDown={e => {
        if (e.target instanceof HTMLElement && e.target.closest('.remove-quoted-text')) return;
        e.preventDefault();
        e.stopPropagation();
        props.onUnhide();
      }}
    >
      <span className="dots">&bull;&bull;&bull;</span>
      <span
        className="remove-quoted-text"
        onMouseUp={e => {
          e.preventDefault();
          e.stopPropagation();
          this.editor.current.removeQuotedText();
          props.onRemove();
        }}
      >
        <RetinaImg
          title={localized('Remove quoted text')}
          name="image-cancel-button.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </span>
    </a>
  );
};
