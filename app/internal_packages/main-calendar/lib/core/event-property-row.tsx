import React from 'react';

interface EventPropertyRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const EventPropertyRow: React.FC<EventPropertyRowProps> = ({
  label,
  children,
  className,
  onClick,
}) => {
  return (
    <div className={`event-property-row${className ? ` ${className}` : ''}`} onClick={onClick}>
      <div className="row-label">{label}</div>
      <div className="row-value">{children}</div>
    </div>
  );
};
