import React from 'react';
import { localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';

/**
 * Empties the field it sits in. A press doesn't take focus from that field, so the field's own
 * blur, which would add what's typed, never runs.
 */
export const ClearButton = ({ onClear }: { onClear: () => void }) => (
  <button
    type="button"
    className="btn-bare clear-button"
    title={localized('Clear')}
    aria-label={localized('Clear')}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClear}
  >
    <SVGIcons.Remove />
  </button>
);
