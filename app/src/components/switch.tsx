import React from 'react';
import PropTypes from 'prop-types';

/* Public: A small React component which renders as a horizontal on/off switch.
   Provide it with `onChange` and `checked` props just like a checkbox:

  ```
  <Switch onChange={this._onToggleChecked} checked={this.state.form.isChecked} />
  ```
*/
type SwitchProps = {
  checked?: boolean;
  onChange: (...args: any[]) => any;
  className?: string;
  label?: string;
  labelledBy?: string;
};

const Switch: React.SFC<SwitchProps> = props => {
  let classnames = `${props.className || ''} slide-switch`;
  if (props.checked) {
    classnames += ' active';
  }

  return (
    <div
      className={classnames}
      role="switch"
      aria-checked={props.checked}
      tabIndex={0}
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      onClick={props.onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          props.onChange(e);
        }
      }}
    >
      <div className="handle" />
    </div>
  );
};

export default Switch;
