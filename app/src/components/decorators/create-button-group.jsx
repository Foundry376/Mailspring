import React from 'react';

export default function CreateButtonGroup(name, buttons, { order = 0 }) {
  const fn = props => {
    return (
      <div key={name} className="button-group" style={{ order }}>
        {buttons.map((Component, index) => <Component key={Component.displayName+index.toString()} {...props} />)}
      </div>
    );
  };
  fn.displayName = name;
  return fn;
}
