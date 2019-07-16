import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const CreateGroupIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <path
      d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <circle
      cx="9"
      cy="7"
      r="4"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <path
      d="M23 21v-2a4 4 0 0 0-3-3.87"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <path
      d="M16 3.13a4 4 0 0 1 0 7.75"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
  </SvgIcon>
);

CreateGroupIcon.propTypes = {
  color: PropTypes.string,
};

CreateGroupIcon.defaultProps = {
  color: '#000',
};

export default CreateGroupIcon;
