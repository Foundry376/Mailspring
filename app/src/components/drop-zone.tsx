import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';

interface DropZoneProps {
  id?: string;
  className?: string;
  style?: any;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  shouldAcceptDrop: (e: React.DragEvent<HTMLDivElement>) => boolean;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragStateChange: ({ isDropping: boolean }) => void;
}

export class DropZone extends React.Component<DropZoneProps> {
  static propTypes = {
    shouldAcceptDrop: PropTypes.func.isRequired,
    onDrop: PropTypes.func.isRequired,
    onDragStateChange: PropTypes.func,
  };

  _dragCounter = 0;

  static defaultProps = {
    onDragOver: () => {},
  };

  // We maintain a "dragCounter" because dragEnter and dragLeave events *stack*
  // when the user moves the item in and out of DOM elements inside of our container.
  // It's really awful and everyone hates it.

  // Alternative solution *maybe* is to set pointer-events:none; during drag.

  _onDragEnter = e => {
    if (!this.props.shouldAcceptDrop(e)) {
      return;
    }
    this._dragCounter += 1;
    if (this._dragCounter === 1 && this.props.onDragStateChange) {
      this.props.onDragStateChange({ isDropping: true });
    }
    e.stopPropagation();
    return;
  };

  _onDragLeave = e => {
    if (!this.props.shouldAcceptDrop(e)) {
      return;
    }
    this._dragCounter -= 1;
    if (this._dragCounter === 0 && this.props.onDragStateChange) {
      this.props.onDragStateChange({ isDropping: false });
    }
    e.stopPropagation();
    return;
  };

  _onDrop = e => {
    if (!this.props.shouldAcceptDrop(e)) {
      return;
    }
    if (this.props.onDragStateChange) {
      this.props.onDragStateChange({ isDropping: false });
    }
    this._dragCounter = 0;
    this.props.onDrop(e);
    e.stopPropagation();
    return;
  };

  render() {
    const otherProps = _.omit(this.props, Object.keys(DropZone.propTypes));
    return (
      <div
        {...otherProps}
        onDragOver={event => {
          event.dataTransfer.dropEffect = 'copy';
          event.preventDefault();
        }}
        onDragEnter={this._onDragEnter}
        onDragLeave={this._onDragLeave}
        onDrop={this._onDrop}
      >
        {this.props.children}
      </div>
    );
  }
}
