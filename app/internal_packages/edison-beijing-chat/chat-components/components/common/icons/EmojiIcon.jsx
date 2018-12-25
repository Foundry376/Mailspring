import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const FilePlusIcon = ({ ...props }) => {
  const scaleFactor=props.size/79;
  return (
    <SvgIcon {...props}>
      <desc>Created with Sketch.</desc>
      <defs></defs>
      <g id="Symbols" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd" transform={`scale(${scaleFactor})`}>
        <g id="icon-chatsent-copy" transform={`translate(-8.000000, -10.000000)`}>
          <path
            d="M73.9288,75.707 C88.5658,61.071 88.5658,37.314 73.9288,22.679 C59.2948,8.044 35.5368,8.041 20.9018,22.679 C6.2658,37.313 6.2658,61.072 20.9018,75.707 C35.5368,90.343 59.2948,90.342 73.9288,75.707 Z"
            id="Stroke-1" stroke={props.color} strokeWidth="3"></path>
          <path
            d="M26.0811,59.2422 C27.0891,62.7242 28.9611,66.0102 31.7041,68.7522 C40.3771,77.4252 54.4551,77.4242 63.1261,68.7522 C65.8691,66.0092 67.7421,62.7242 68.7501,59.2422"
            id="Stroke-3" stroke={props.color} strokeWidth="3"></path>
          <path
            d="M31.5,45 C31.5,48.037 29.037,50.5 26,50.5 C22.962,50.5 20.5,48.037 20.5,45 C20.5,41.963 22.962,39.5 26,39.5 C29.037,39.5 31.5,41.963 31.5,45"
            id="Fill-5" stroke={props.color}></path>
          <path
            d="M73.0001,45.5 C73.0001,48.537 70.5371,51 67.5001,51 C64.4621,51 62.0001,48.537 62.0001,45.5 C62.0001,42.463 64.4621,40 67.5001,40 C70.5371,40 73.0001,42.463 73.0001,45.5"
            id="Fill-7" stroke={props.color}></path>
        </g>
      </g>
    </SvgIcon>
  );
};

FilePlusIcon.propTypes = {
  color: PropTypes.string,
};

FilePlusIcon.defaultProps = {
  color: '#000',
  size: 24
};

export default FilePlusIcon;
