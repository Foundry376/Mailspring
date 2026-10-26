import React from 'react';

interface LineIconProps {
  className?: string;
  size?: number;
  /** In the 24-unit grid the icon is drawn on, so a small icon needs a larger one. */
  strokeWidth?: number;
}

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

// Filled drawings on a 20-unit grid. The stylesheet that places one sets its size and fill.
function filledIcon(displayName: string, paths: React.ReactNode) {
  const Icon = () => <svg viewBox="0 0 20 20">{paths}</svg>;
  Icon.displayName = displayName;
  return Icon;
}

export const Briefcase = filledIcon(
  'Briefcase',
  <path
    fillRule="evenodd"
    d="M19,5h-4V2c0-0.55-0.45-1-1-1H6C5.45,1,5,1.45,5,2v3H1C0.45,5,0,5.45,0,6v5h4v-1
			h2v1h8v-1h2v1h4V6C20,5.45,19.55,5,19,5z M13,5H7V3h6V5z M16,13h-2v-1H6v1H4v-1H0v6c0,0.55,0.45,1,1,1h18c0.55,0,1-0.45,1-1v-6h-4
			V13z"
  />
);

export const Envelope = filledIcon(
  'Envelope',
  <path
    fillRule="evenodd"
    d="M0,4.01v11.91l6.27-6.27L0,4.01z M18.91,2.98H1.09L10,10.97L18.91,2.98z
			 M13.73,9.64L20,15.92V4.01L13.73,9.64z M10.5,12.54L10.5,12.54c-0.13,0.12-0.31,0.19-0.5,0.19s-0.37-0.07-0.5-0.19l0,0
			l-2.11-1.89l-6.33,6.33h17.88l-6.33-6.33L10.5,12.54z"
  />
);

export const Link = filledIcon(
  'Link',
  <path
    fillRule="evenodd"
    d="M10.85,11.98l-4.44,4.44l-1,1C5.05,17.78,4.55,18,4,18c-1.1,0-2-0.9-2-2
			c0-0.55,0.22-1.05,0.59-1.41l5.44-5.44C7.69,9.06,7.36,9,7,9c-1.11,0-2.09,0.46-2.82,1.18l-0.01-0.01l-3,3l0.01,0.01
			C0.46,13.91,0,14.89,0,16c0,2.21,1.79,4,4,4c1.11,0,2.09-0.46,2.82-1.18l0.01,0.01l3-3l-0.01-0.01C10.54,15.09,11,14.11,11,13
			C11,12.64,10.94,12.31,10.85,11.98z M20,4c0-2.21-1.79-4-4-4c-1.11,0-2.09,0.46-2.82,1.18l-0.01-0.01l-3,3l0.01,0.01
			C9.46,4.91,9,5.89,9,7c0,0.36,0.06,0.69,0.15,1.02l4.44-4.44l1-1C14.95,2.22,15.45,2,16,2c1.1,0,2,0.9,2,2
			c0,0.55-0.22,1.05-0.59,1.41l-5.44,5.44C12.31,10.94,12.64,11,13,11c1.11,0,2.09-0.46,2.82-1.18l0.01,0.01l3-3l-0.01-0.01
			C19.54,6.09,20,5.11,20,4z M5,14c0,0.55,0.45,1,1,1c0.28,0,0.53-0.11,0.71-0.29l8-8C14.89,6.53,15,6.28,15,6c0-0.55-0.45-1-1-1
			c-0.28,0-0.53,0.11-0.71,0.29l-2,2l-2,2l-2,2l-2,2C5.11,13.47,5,13.72,5,14z"
  />
);

export const Map = filledIcon(
  'Map',
  <path
    fillRule="evenodd"
    d="M19.54,4.18l0.01-0.02l-6-4l-0.01,0.02C13.39,0.08,13.21,0,13,0
			s-0.39,0.08-0.54,0.18l-0.01-0.02L7,3.8L1.55,0.17L1.54,0.18C1.39,0.08,1.21,0,1,0C0.45,0,0,0.45,0,1v14
			c0,0.35,0.19,0.64,0.46,0.82l-0.01,0.02l6,4l0.01-0.02C6.61,19.92,6.79,20,7,20s0.39-0.08,0.54-0.18l0.01,0.02L13,16.2l5.45,3.63
			l0.01-0.02C18.61,19.92,18.79,20,19,20c0.55,0,1-0.45,1-1V5C20,4.65,19.81,4.36,19.54,4.18z M6,17.13l-4-2.67V2.87l4,2.67V17.13z
			 M12,14.46l-4,2.67V5.54l4-2.67V14.46z M18,17.13l-4-2.67V2.87l4,2.67V17.13z"
  />
);

export const NewPerson = filledIcon(
  'NewPerson',
  <path
    d="M11.41,15.92c-1.46-0.65-1.26-1.05-1.31-1.59c-0.01-0.07-0.01-0.15-0.01-0.23c0.5-0.45,0.91-1.07,1.18-1.78
			c0,0,0.01-0.04,0.02-0.05c0.06-0.15,0.11-0.32,0.15-0.48c0.33-0.07,0.53-0.44,0.6-0.78c0.08-0.14,0.23-0.48,0.2-0.87
			c-0.05-0.5-0.24-0.73-0.47-0.82c0-0.03,0-0.06,0-0.09c0-0.63-0.06-1.55-0.17-2.15c-0.02-0.17-0.06-0.33-0.11-0.5
			c-0.22-0.73-0.67-1.4-1.27-1.86C9.58,4.25,8.7,4,7.92,4C7.14,4,6.26,4.25,5.64,4.73C5.03,5.2,4.58,5.86,4.37,6.59
			c-0.05,0.16-0.08,0.33-0.11,0.5C4.14,7.69,4.08,8.6,4.08,9.23c0,0.03,0,0.05,0,0.08C3.85,9.4,3.65,9.63,3.6,10.14
			c-0.04,0.39,0.12,0.73,0.2,0.87c0.08,0.35,0.28,0.72,0.62,0.78c0.04,0.17,0.09,0.33,0.15,0.48c0,0.01,0.01,0.02,0.01,0.03
			l0.01,0.01c0.27,0.72,0.69,1.35,1.21,1.8c0,0.07-0.01,0.14-0.01,0.21c-0.05,0.54,0.1,0.94-1.36,1.59
			c-1.46,0.65-3.66,1.35-4.11,2.4C-0.14,19.38,0.04,20,0.04,20h15.75c0,0,0.18-0.62-0.27-1.67C15.07,17.27,12.87,16.58,11.41,15.92z
			 M18.87,3h-2V1c0-0.55-0.45-1-1-1c-0.55,0-1,0.45-1,1v2h-2c-0.55,0-1,0.45-1,1c0,0.55,0.45,1,1,1h2v2c0,0.55,0.45,1,1,1
			c0.55,0,1-0.45,1-1V5h2c0.55,0,1-0.45,1-1C19.87,3.45,19.42,3,18.87,3z"
  />
);

export const Note = filledIcon(
  'Note',
  <path
    fillRule="evenodd"
    d="M2,0H13L19,6V20H2V0z M13,0L19,6H13V0z M4,9H16V11H4V9z M4,13H16V15H4V13z M4,17H12V19H4V17z"
  />
);

export const PeopleFilled = filledIcon(
  'PeopleFilled',
  <path
    d="M16.94,17c-0.06-0.33-0.17-0.69-0.33-1.06c-0.45-0.97-1.37-1.52-3.24-2.3
			c-0.17-0.07-0.76-0.31-0.77-0.32c-0.1-0.04-0.2-0.08-0.28-0.12c0.05-0.14,0.04-0.29,0.06-0.45c0-0.05,0.01-0.11,0.01-0.16
			c-0.25-0.21-0.47-0.48-0.65-0.79c0.22-0.34,0.41-0.71,0.56-1.12l0.04-0.11c-0.01,0.02-0.01,0.02-0.02,0.08
			c0.02-0.05,0.04-0.1,0.06-0.15c0.36-0.26,0.6-0.67,0.72-1.13c0.18-0.37,0.29-0.82,0.25-1.3c-0.05-0.5-0.21-0.92-0.47-1.22
			c-0.02-0.53-0.06-1.11-0.12-1.59C13.14,5.09,13.59,5,14,5c0.59,0,1.26,0.19,1.73,0.55c0.46,0.35,0.8,0.85,0.97,1.4
			c0.04,0.13,0.07,0.25,0.08,0.38c0.08,0.45,0.13,1.14,0.13,1.61c0,0.02,0,0.05,0,0.07c0.16,0.07,0.31,0.24,0.35,0.62
			c0.02,0.29-0.09,0.55-0.15,0.65c-0.05,0.26-0.2,0.53-0.46,0.59c-0.03,0.12-0.07,0.25-0.11,0.36c-0.01,0.01-0.01,0.04-0.01,0.04
			c-0.2,0.53-0.51,1-0.89,1.34c0,0.06,0,0.12,0.01,0.17c0.04,0.41-0.11,0.71,1,1.19c1.1,0.5,2.77,1.01,3.13,1.79
			c0.34,0.79,0.2,1.25,0.2,1.25H16.94z M11.52,13.94c1.47,0.66,3.7,1.35,4.18,2.39c0.45,1.05,0.27,1.67,0.27,1.67H0.04
			c0,0-0.19-0.62,0.27-1.67c0.46-1.05,2.68-1.75,4.16-2.4c1.48-0.65,1.33-1.05,1.38-1.59c0-0.07,0.01-0.14,0.01-0.21
			c-0.52-0.45-0.95-1.08-1.22-1.8l-0.01-0.01c0-0.01-0.01-0.02-0.01-0.03C4.55,10.14,4.5,9.97,4.46,9.8
			C4.12,9.74,3.92,9.37,3.84,9.02C3.76,8.88,3.6,8.54,3.64,8.15C3.69,7.64,3.9,7.41,4.13,7.32c0-0.03,0-0.05,0-0.08
			c0-0.64,0.05-1.55,0.17-2.15c0.02-0.17,0.06-0.34,0.11-0.5c0.22-0.74,0.68-1.4,1.29-1.86C6.32,2.25,7.21,2,8,2
			s1.68,0.25,2.31,0.73c0.62,0.46,1.07,1.13,1.29,1.86c0.05,0.17,0.09,0.33,0.11,0.5c0.11,0.6,0.17,1.52,0.17,2.15
			c0,0.03,0,0.06,0,0.09c0.22,0.09,0.42,0.32,0.47,0.82c0.03,0.39-0.12,0.73-0.2,0.87c-0.07,0.34-0.27,0.71-0.61,0.78
			c-0.04,0.16-0.09,0.33-0.15,0.48c-0.01,0.01-0.02,0.05-0.02,0.05c-0.27,0.71-0.68,1.33-1.19,1.78c0,0.08,0,0.16,0.01,0.23
			C10.24,12.89,10.04,13.29,11.52,13.94z"
  />
);

export const PersonFilled = filledIcon(
  'PersonFilled',
  <path
    fillRule="evenodd"
    d="M19.61,17.91c-0.57-1.32-3.35-2.19-5.19-3.01c-1.85-0.82-1.59-1.31-1.66-1.99
			c-0.01-0.09-0.01-0.19-0.02-0.29c0.63-0.56,1.15-1.33,1.49-2.22c0,0,0.02-0.05,0.02-0.06c0.07-0.19,0.13-0.39,0.19-0.6
			c0.42-0.09,0.67-0.55,0.76-0.98c0.1-0.17,0.29-0.6,0.25-1.08c-0.06-0.62-0.31-0.91-0.59-1.03c0-0.04,0-0.07,0-0.11
			c0-0.79-0.07-1.93-0.22-2.68c-0.03-0.21-0.08-0.42-0.14-0.62c-0.27-0.92-0.84-1.74-1.6-2.32C12.11,0.32,11,0,10.01,0
			s-2.1,0.32-2.89,0.92C6.36,1.5,5.79,2.32,5.52,3.24c-0.06,0.2-0.11,0.41-0.14,0.62C5.24,4.61,5.16,5.75,5.16,6.54
			c0,0.03,0,0.06,0,0.1c-0.29,0.11-0.55,0.4-0.61,1.04C4.51,8.16,4.7,8.59,4.8,8.76C4.9,9.2,5.15,9.67,5.59,9.74
			c0.05,0.21,0.12,0.41,0.19,0.6c0,0.01,0.01,0.03,0.01,0.04L5.8,10.4c0.34,0.91,0.87,1.69,1.52,2.25c0,0.09-0.01,0.18-0.02,0.26
			c-0.07,0.68,0.13,1.17-1.72,1.99s-4.62,1.69-5.19,3.01C-0.18,19.23,0.05,20,0.05,20h19.9C19.95,20,20.18,19.23,19.61,17.91z"
  />
);

export const Phone = filledIcon(
  'Phone',
  <path
    fillRule="evenodd"
    d="M19.91,15.51c-0.08-0.08-4.21-2.5-4.35-2.57c-0.14-0.07-0.27-0.1-0.4-0.1
			c-0.19,0-0.42,0.13-0.71,0.4c-0.28,0.27-1.17,1.49-1.43,1.76c-0.26,0.27-0.48,0.4-0.65,0.4c-0.08,0-0.19-0.02-0.32-0.07
			c-0.13-0.05-1.45-0.73-4.2-3.15c-2.75-2.42-3.11-4-3.13-4.44c0-0.17,0.13-0.39,0.4-0.65C5.4,6.84,5.69,6.58,6.01,6.35
			c0.32-0.24,0.61-0.5,0.88-0.78c0.27-0.28,0.4-0.52,0.4-0.71c0-0.13-0.03-0.27-0.1-0.4C7.12,4.32,4.62,0.19,4.53,0.1
			C4.34-0.08,3.61,0,3.24,0.2C0.25,1.82,0,4,0.05,4.86c0.05,0.89,0.61,5.58,5.2,9.93c5.7,5.41,9.66,5.2,9.92,5.2
			c0.87,0,3.52-0.48,4.65-3.19C19.98,16.42,20.13,15.73,19.91,15.51z"
  />
);

export const Crown = () => (
  <svg width="20px" height="20px" viewBox="0 0 20 20">
    <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
      <g fill="currentColor">
        <path d="M2,8 L6,10 L10,5 L14,10 L18,8 L17,15 L3,15 L2,8 Z M10,2 C10.5522847,2 11,2.44771525 11,3 C11,3.55228475 10.5522847,4 10,4 C9.44771525,4 9,3.55228475 9,3 C9,2.44771525 9.44771525,2 10,2 Z M1,5 C1.55228475,5 2,5.44771525 2,6 C2,6.55228475 1.55228475,7 1,7 C0.44771525,7 0,6.55228475 0,6 C0,5.44771525 0.44771525,5 1,5 Z M19,5 C19.5522847,5 20,5.44771525 20,6 C20,6.55228475 19.5522847,7 19,7 C18.4477153,7 18,6.55228475 18,6 C18,5.44771525 18.4477153,5 19,5 Z M3,16 L17,16 L17,18 L3,18 L3,16 Z" />
      </g>
    </g>
  </svg>
);

export const Tag = () => (
  <svg width="14px" height="14px" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M2 2.75C2 2.34 2.34 2 2.75 2h5.07c.2 0 .39.08.53.22l5.5 5.5c.29.29.29.77 0 1.06l-5.07 5.07a.75.75 0 0 1-1.06 0l-5.5-5.5A.75.75 0 0 1 2 7.82V2.75Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <circle cx="5.25" cy="5.25" r="1.1" fill="currentColor" />
  </svg>
);

export const Remove = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

// Drawn in pixels, so the 1px margin and 1.5px stroke stay the same at every size.
export const Plus = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
    <path
      d={`M${size / 2} 1v${size - 2}M1 ${size / 2}h${size - 2}`}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const Minus = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
    <path
      d={`M1 ${size / 2}h${size - 2}`}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

function chevron(displayName: string, width: number, height: number, d: string) {
  const Icon = () => (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const ChevronLeft = chevron('ChevronLeft', 6, 10, 'M5 1L1 5l4 4');
export const ChevronRight = chevron('ChevronRight', 6, 10, 'M1 1l4 4-4 4');
export const ChevronUp = chevron('ChevronUp', 10, 6, 'M1 5l4-4 4 4');
export const ChevronDown = chevron('ChevronDown', 10, 6, 'M1 1l4 4 4-4');
