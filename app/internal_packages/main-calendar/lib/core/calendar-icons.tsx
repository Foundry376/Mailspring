import React from 'react';

/**
 * Recurring event icon — two arrows tracing a rounded rectangle with
 * visible gaps between each arrowhead tip and the next segment.
 */
export const RecurringIcon = ({ size = 10 }: { size?: number }) => (
  <svg
    className="recurring-icon"
    viewBox="0 0 12 12"
    width={size}
    height={size}
    aria-label="Recurring"
  >
    {/* Left half: bottom edge → bottom-left corner → left edge → top-left corner → top edge */}
    <path
      d="M5.5 8.5 H3.5 A1.5 1.5 0 0 1 2 7 V5 A1.5 1.5 0 0 1 3.5 3.5 H6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    {/* Top-right arrowhead */}
    <polyline
      points="6.5,2 8,3.5 6.5,5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Right half: top-right corner → right edge → bottom-right corner → bottom edge */}
    <path
      d="M8.5 3.5 A1.5 1.5 0 0 1 10 5 V7 A1.5 1.5 0 0 1 8.5 8.5 H6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    {/* Bottom-left arrowhead */}
    <polyline
      points="6.5,7 5,8.5 6.5,10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
