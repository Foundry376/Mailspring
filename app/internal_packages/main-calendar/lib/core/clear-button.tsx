import React from 'react';
import { localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';

// A press keeps focus in the field: its blur would add what's typed before the clear.
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
