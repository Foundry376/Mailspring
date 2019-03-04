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
};

const Switch: React.SFC<SwitchProps> = props => {
  let classnames = `${props.className || ''} slide-switch`;
  if (props.checked) {
    classnames += ' active';
  }

  return (
    <div className={classnames} onClick={props.onChange}>
      <div className="handle" />
    </div>
  );
};

export default Switch;
