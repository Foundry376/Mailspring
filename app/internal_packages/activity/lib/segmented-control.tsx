import React from 'react';
import classnames from 'classnames';

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = options.findIndex((o) => o.id === value);
    if (e.key === 'ArrowRight') {
      onChange(options[(idx + 1) % options.length].id);
    } else if (e.key === 'ArrowLeft') {
      onChange(options[(idx - 1 + options.length) % options.length].id);
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="segmented-control" role="radiogroup" onKeyDown={onKeyDown}>
      {options.map((opt) => (
        <div
          key={opt.id}
          role="radio"
          aria-checked={opt.id === value}
          tabIndex={opt.id === value ? 0 : -1}
          className={classnames('segment', { active: opt.id === value })}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
SegmentedControl.displayName = 'SegmentedControl';
