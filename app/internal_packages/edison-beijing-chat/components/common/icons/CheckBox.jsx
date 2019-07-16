import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const style = {
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Checked = ({ checkColor, circleColor, ...props }) => (
  <SvgIcon {...props}>
    <path
      d="M22 11.07V12a10 10 0 1 1-5.93-9.14"
      style={{ stroke: circleColor, ...style }}
    />
    <polyline
      points="23 3 12 14 9 11"
      style={{ stroke: checkColor, ...style }}
    />
  </SvgIcon>
);

Checked.propTypes = {
  checkColor: PropTypes.string,
  circleColor: PropTypes.string,
};

Checked.defaultProps = {
  checkColor: '#000',
  circleColor: '#000',
};

const Unchecked = ({ circleColor, ...props }) => (
  <SvgIcon {...props}>
    <circle cx="12" cy="12" r="10" style={{ stroke: circleColor, ...style }} />
  </SvgIcon>
);

Unchecked.propTypes = {
  circleColor: PropTypes.string,
};

Unchecked.defaultProps = {
  circleColor: '#000',
};

const CheckBox = ({ checked, checkColor, checkedCircleColor, uncheckedCircleColor, ...props }) => (
  checked ?
    <Checked checkColor={checkColor} circleColor={checkedCircleColor} {...props} /> :
    <Unchecked circleColor={uncheckedCircleColor} {...props} />
);

CheckBox.propTypes = {
  checked: PropTypes.bool,
  checkColor: PropTypes.string,
  checkedCircleColor: PropTypes.string,
  uncheckedCircleColor: PropTypes.string,
};

CheckBox.defaultProps = {
  checked: false,
  checkColor: '#000',
  checkedCircleColor: '#000',
  uncheckedCircleColor: '#000',
};

export default CheckBox;
