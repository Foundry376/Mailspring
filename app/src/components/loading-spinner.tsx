import React from 'react';

type LoadingSpinnerProps = {
  /* Diameter of the spinner in pixels. Defaults to 14. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

const SPOKES = 12;
const TICKS = Array.from({ length: SPOKES }, (_, i) => `${i * (360 / SPOKES)} 12 12`).join(';');

/*
Public: A small 12-spoke "loading" spinner drawn as an inline SVG in `currentColor`. In the app
it takes the theme's subtle text color (`loading-spinner.less`), so it reads in light and dark
themes; set `color` on it to change that.

It steps with SMIL rather than a CSS animation so the same markup also spins inside email
frames, which don't load the app's stylesheets (see `message-item-body.tsx`).

Section: Component Kit
*/
export const LoadingSpinner: React.FunctionComponent<LoadingSpinnerProps> = ({
  size = 14,
  className,
  style,
}) => (
  <svg
    className={`loading-spinner${className ? ` ${className}` : ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={style}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g>
      {Array.from({ length: SPOKES }).map((_, i) => (
        <rect
          key={i}
          x={11}
          y={2}
          width={2}
          height={6}
          rx={1}
          fill="currentColor"
          opacity={(i + 1) / SPOKES}
          transform={`rotate(${i * (360 / SPOKES)} 12 12)`}
        />
      ))}
      <animateTransform
        attributeName="transform"
        type="rotate"
        calcMode="discrete"
        values={TICKS}
        dur="1s"
        repeatCount="indefinite"
      />
    </g>
  </svg>
);
