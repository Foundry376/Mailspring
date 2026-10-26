import React from 'react';

interface LineIconProps {
  className?: string;
  size?: number;
  /** In the 24-unit grid the icon is drawn on, so a small icon needs a larger one. */
  strokeWidth?: number;
}

/** An outline icon on a 24-unit grid, drawn in the text colour. */
function lineIcon(displayName: string, paths: React.ReactNode) {
  const Icon = ({ className, size = 16, strokeWidth = 1.7 }: LineIconProps) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const Clock = lineIcon(
  'Clock',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);

export const Globe = lineIcon(
  'Globe',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.3 3.5 5.2 3.5 8.5s-1 6.2-3.5 8.5c-2.5-2.3-3.5-5.2-3.5-8.5s1-6.2 3.5-8.5z" />
  </>
);

export const Repeat = lineIcon(
  'Repeat',
  <>
    <path d="M4 11a7 7 0 0 1 12.5-4.3L19 9M20 13a7 7 0 0 1-12.5 4.3L5 15" />
    <path d="M19 4.5V9h-4.5M5 19.5V15h4.5" />
  </>
);

export const Person = lineIcon(
  'Person',
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </>
);

export const Video = lineIcon(
  'Video',
  <>
    <rect x="3" y="6.5" width="12" height="11" rx="2" />
    <path d="M15 10.5l6-3.5v10l-6-3.5" />
  </>
);

export const Location = lineIcon(
  'Location',
  <>
    <path d="M12 22s-7-8-7-12a7 7 0 1 1 14 0c0 4-7 12-7 12z" />
    <circle cx="12" cy="10" r="2.6" fill="currentColor" stroke="none" />
  </>
);

export const ArrowUp = lineIcon('ArrowUp', <path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDown = lineIcon('ArrowDown', <path d="M12 5v14M6 13l6 6 6-6" />);
export const ArrowLeft = lineIcon('ArrowLeft', <path d="M19 12H5M11 6l-6 6 6 6" />);
export const ArrowRight = lineIcon('ArrowRight', <path d="M5 12h14M13 6l6 6-6 6" />);

// Drawn for the 10px circle that shows an attendee's answer.
export const Check = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M1.5 5.5L4 8l4.5-6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Cross = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const QuestionMark = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M3.1 3.7a1.9 1.9 0 1 1 2.9 1.6c-.6.4-1 .8-1 1.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="5" cy="8.7" r="0.85" fill="currentColor" />
  </svg>
);
