import _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import { PropTypes, Utils } from 'mailspring-exports';

const ResizableHandle: { [side: string]: IResizeHandle } = {
  Top: {
    axis: 'vertical',
    className: 'flexbox-handle-vertical flexbox-handle-top',
    transform(state, props, event) {
      return {
        height: Math.min(
          props.maxHeight != null ? props.maxHeight : 10000,
          Math.max(props.minHeight != null ? props.minHeight : 0, state.bcr.bottom - event.pageY)
        ),
      };
    },
  },
  Bottom: {
    axis: 'vertical',
    className: 'flexbox-handle-vertical flexbox-handle-bottom',
    transform(state, props, event) {
      return {
        height: Math.min(
          props.maxHeight != null ? props.maxHeight : 10000,
          Math.max(props.minHeight != null ? props.minHeight : 0, event.pageY - state.bcr.top)
        ),
      };
    },
  },
  Left: {
    axis: 'horizontal',
    className: 'flexbox-handle-horizontal flexbox-handle-left',
    transform(state, props, event) {
      return {
        width: Math.min(
          props.maxWidth != null ? props.maxWidth : 10000,
          Math.max(props.minWidth != null ? props.minWidth : 0, state.bcr.right - event.pageX)
        ),
      };
    },
  },
  Right: {
    axis: 'horizontal',
    className: 'flexbox-handle-horizontal flexbox-handle-right',
    transform(state, props, event) {
      return {
        width: Math.min(
          props.maxWidth != null ? props.maxWidth : 10000,
          Math.max(props.minWidth != null ? props.minWidth : 0, event.pageX - state.bcr.left)
        ),
      };
    },
  },
};

interface IResizeHandle {
  axis: string;
  className: string;
  transform(
    state: ResizableRegionState,
    props: ResizableRegionProps,
    event: MouseEvent
  ): { width?: number; height?: number };
}

type ResizableRegionProps = {
  handle: IResizeHandle;
  onResize?: (...args: any[]) => any;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  style?: object;
};

type ResizableRegionState = {
  height?: number;
  width?: number;
  dragging: boolean;
  bcr?: ClientRect;
};

/*
Public: ResizableRegion wraps it's `children` in a div with a fixed width or height, and a
draggable edge. It is used throughout N1 to implement resizable columns, trays, etc.

Section: Component Kit
*/
class ResizableRegion extends React.Component<
  ResizableRegionProps & React.HTMLProps<HTMLDivElement>,
  ResizableRegionState
> {
  static displayName = 'ResizableRegion';
  static Handle = ResizableHandle;

  /*
    Public: React `props` supported by ResizableRegion:

     - `handle` Provide a {ResizableHandle} to indicate which edge of the
       region should be draggable.
     - `onResize` A {Function} that will be called continuously as the region is resized.
     - `initialWidth` (optional) Initial width, if the handle indicates a horizontal resizing axis.
     - `minWidth` (optional) Minimum width, if the handle indicates a horizontal resizing axis.
     - `maxWidth` (optional) Maximum width, if the handle indicates a horizontal resizing axis.
     - `initialHeight` (optional) Initial height, if the handle indicates a vertical resizing axis.
     - `minHeight` (optional) Minimum height, if the handle indicates a vertical resizing axis.
     - `maxHeight` (optional) Maximum height, if the handle indicates a vertical resizing axis.
    */
  static propTypes = {
    handle: PropTypes.object.isRequired,
    onResize: PropTypes.func,

    initialWidth: PropTypes.number,
    minWidth: PropTypes.number,
    maxWidth: PropTypes.number,

    initialHeight: PropTypes.number,
    minHeight: PropTypes.number,
    maxHeight: PropTypes.number,

    style: PropTypes.object,
  };

  static defaultProps = {
    handle: ResizableHandle.Right,
  };

  constructor(props) {
    super(props);

    this.state = {
      dragging: false,
      width: this.props.initialWidth,
      height: this.props.initialHeight,
    };
  }

  render() {
    let containerStyle;
    if (this.props.handle.axis === 'horizontal') {
      containerStyle = _.extend({}, this.props.style, {
        minWidth: this.props.minWidth,
        maxWidth: this.props.maxWidth,
        position: 'relative',
      });

      if (this.state.width != null) {
        containerStyle.width = this.state.width;
      } else {
        containerStyle.flex = 1;
      }
    } else {
      containerStyle = _.extend({}, this.props.style, {
        minHeight: this.props.minHeight,
        maxHeight: this.props.maxHeight,
        position: 'relative',
        width: '100%',
      });

      if (this.state.height != null) {
        containerStyle.height = this.state.height;
      } else {
        containerStyle.flex = 1;
      }
    }

    const otherProps = Utils.fastOmit(this.props, Object.keys(ResizableRegion.propTypes));

    return (
      <div style={containerStyle} {...otherProps}>
        {this.props.children}
        <div className={this.props.handle.className} onMouseDown={this._mouseDown}>
          <div />
        </div>
      </div>
    );
  }

  componentDidUpdate(lastProps, lastState) {
    if (lastState.dragging && !this.state.dragging) {
      document.removeEventListener('mousemove', this._mouseMove);
      document.removeEventListener('mouseup', this._mouseUp);
    } else if (!lastState.dragging && this.state.dragging) {
      document.addEventListener('mousemove', this._mouseMove);
      document.addEventListener('mouseup', this._mouseUp);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (
      nextProps.handle.axis === 'vertical' &&
      nextProps.initialHeight !== this.props.initialHeight
    ) {
      this.setState({ height: nextProps.initialHeight });
    }
    if (
      nextProps.handle.axis === 'horizontal' &&
      nextProps.initialWidth !== this.props.initialWidth
    ) {
      this.setState({ width: nextProps.initialWidth });
    }
  }

  _mouseDown = event => {
    if (event.button !== 0) {
      return;
    }
    const bcr = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    this.setState({
      dragging: true,
      bcr,
    });
    event.stopPropagation();
    event.preventDefault();
  };

  _mouseUp = event => {
    if (event.button !== 0) {
      return;
    }
    this.setState({
      dragging: false,
    });
    if (this.props.onResize) {
      this.props.onResize(this.state.height != null ? this.state.height : this.state.width);
    }
    event.stopPropagation();
    event.preventDefault();
  };

  _mouseMove = event => {
    if (!this.state.dragging) {
      return;
    }
    this.setState(this.props.handle.transform(this.state, this.props, event));
    if (this.props.onResize) {
      this.props.onResize(this.state.height != null ? this.state.height : this.state.width);
    }
    event.stopPropagation();
    event.preventDefault();
  };
}

export default ResizableRegion;
