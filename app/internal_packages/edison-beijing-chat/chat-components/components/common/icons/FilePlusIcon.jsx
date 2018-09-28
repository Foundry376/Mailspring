import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const getStyle = color => ({
  fill: 'none',
  stroke: color,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
});

const FilePlusIcon = ({ color = '#000', ...props }) => {
  const style = getStyle(color);
  return (
    <SvgIcon {...props}>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        style={style}
      />
      <polyline
        points="14 2 14 8 20 8"
        style={style}
      />
      <line
        x1="12"
        y1="18"
        x2="12"
        y2="12"
        style={style}
      />
      <line
        x1="9"
        y1="15"
        x2="15"
        y2="15"
        style={style}
      />
    </SvgIcon>
  );
};

FilePlusIcon.propTypes = {
  color: PropTypes.string,
};

FilePlusIcon.defaultProps = {
  color: '#000',
};

export default FilePlusIcon;
