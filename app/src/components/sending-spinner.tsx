import React from 'react';

type SendingSpinnerProps = {
  /* Diameter of the spinner in pixels. Defaults to 18. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/*
Public: A small 12-spoke radial "sending" spinner drawn as an inline SVG.

Unlike the old animated GIF, this spinner is drawn with `currentColor`, so it
inherits the surrounding text color and looks correct in both light and dark
themes. It spins via a CSS animation (`.sending-spinner`, see
`app/internal_packages/message-list/styles/message-list.less`).

Section: Component Kit
*/
export const SendingSpinner: React.FunctionComponent<SendingSpinnerProps> = ({
  size = 18,
  className,
  style,
}) => (
  <svg
    className={`sending-spinner${className ? ` ${className}` : ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={style}
    xmlns="http://www.w3.org/2000/svg"
  >
    {Array.from({ length: 12 }).map((_, i) => (
      <rect
        key={i}
        x={11}
        y={2}
        width={2}
        height={6}
        rx={1}
        fill="currentColor"
        opacity={(i + 1) / 12}
        transform={`rotate(${i * 30} 12 12)`}
      />
    ))}
  </svg>
);
