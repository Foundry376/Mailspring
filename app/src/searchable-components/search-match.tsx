import React from 'react';

const SearchMatch = (props: {
  regionId?: string;
  className?: string;
  renderIndex?: number;
  children?: React.ReactNode;
}) => {
  return (
    <span
      data-region-id={props.regionId}
      data-render-index={props.renderIndex}
      className={`search-match ${props.className}`}
    >
      {props.children}
    </span>
  );
};

export default SearchMatch;
