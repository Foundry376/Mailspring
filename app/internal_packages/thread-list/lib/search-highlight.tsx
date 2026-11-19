import React from 'react';
import { Highlighted } from 'mailspring-exports';

export function renderHighlighted(parts: Highlighted, contextClassName?: string) {
  return parts.map((part, idx) =>
    part.match ? (
      <mark key={idx} className="search-match">
        {part.text}
      </mark>
    ) : (
      <span key={idx} className={contextClassName}>
        {part.text}
      </span>
    )
  );
}
