import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const FilterIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <polyline
      points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
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

FilterIcon.propTypes = {
  color: PropTypes.string,
};

FilterIcon.defaultProps = {
  color: '#000',
};

export default FilterIcon;
