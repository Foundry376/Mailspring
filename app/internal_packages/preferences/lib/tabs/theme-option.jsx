import React from 'react';
import PropTypes from 'prop-types';

import { RetinaImg } from 'mailspring-component-kit';

class ThemeOption extends React.Component {
  static displayName = 'ThemeOption';
  static propTypes = {
    theme: PropTypes.object.isRequired,
    active: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
  }

  render() {
    const mode = this.props.theme.name.replace('ui-', '');
    let classname = 'appearance-mode';
    if (this.props.active) {
      classname += ' active'
    };
    const label = {
      light: 'Light Mode',
      dark: 'Dark Mode',
    }[mode];
    return (
      <div className={classname} onMouseDown={this.props.onSelect}>
        <RetinaImg name={`prefs-appearance-${mode}.png`} mode="" />
        {label}
      </div>
    );
  }
}

export default ThemeOption;
