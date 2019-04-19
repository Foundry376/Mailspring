import React from 'react';

export default function CreateButtonGroup(name, buttons, { order = 0, ...otherProps }) {
  const fn = props => {
    return (
      <div key={name} className="button-group" style={{ order, ...otherProps }}>
        {buttons.map((Component, index) => <Component key={Component.displayName + index.toString()} {...props} />)}
      </div>
    );
  };
  fn.displayName = name;
  return fn;
}
