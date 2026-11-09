import React from 'react';
import { RetinaImg } from './retina-img';

/** A select that reads as text, as the calendar toolbar's view picker does, with the caret on hover. */
export const TextSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <span className="text-select">
    <select {...props} />
    <RetinaImg
      name="ic-calendar-down-arrow.png"
      mode={RetinaImg.Mode.ContentIsMask}
      style={{ width: 8, height: 5, WebkitMaskSize: 'contain' }}
      aria-hidden="true"
    />
  </span>
);
