import React from 'react';
import ReactDOM from 'react-dom';
import { PropTypes, Utils } from 'mailspring-exports';

interface EventGridBackgroundProps {
  height: number;
  numColumns: number;
  tickGenerator: (arg: { type: string }) => Array<{ yPos }>;
  intervalHeight: number;
}

export default class EventGridBackground extends React.Component<EventGridBackgroundProps> {
  static displayName = 'EventGridBackground';

  _lastHoverRect: { x?; y?; width?; height? } = {};

  componentDidMount() {
    this._renderEventGridBackground();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    this._renderEventGridBackground();
  }

  _renderEventGridBackground() {
    const canvas = ReactDOM.findDOMNode(this.refs.canvas) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const height = this.props.height;
    canvas.height = height;

    const doStroke = (type, strokeStyle) => {
      ctx.strokeStyle = strokeStyle;
      ctx.beginPath();
      for (const { yPos } of this.props.tickGenerator({ type })) {
        ctx.moveTo(0, yPos);
        ctx.lineTo(canvas.width, yPos);
      }
      ctx.stroke();
    };

    doStroke('minor', '#f1f1f1'); // Minor Ticks
    doStroke('major', '#e0e0e0'); // Major ticks
  }

  mouseMove({ x, y, width }) {
    if (!width || x == null || y == null) {
      return;
    }
    const lr = this._lastHoverRect;
    const xInt = width / this.props.numColumns;
    const yInt = this.props.intervalHeight;
    const r = {
      x: Math.floor(x / xInt) * xInt + 1,
      y: Math.floor(y / yInt) * yInt + 1,
      width: xInt - 2,
      height: yInt - 2,
    };
    if (lr.x === r.x && lr.y === r.y && lr.width === r.width) {
      return;
    }
    this._lastHoverRect = r;
    const cursor = ReactDOM.findDOMNode(this.refs.cursor) as HTMLElement;
    cursor.style.left = `${r.x}px`;
    cursor.style.top = `${r.y}px`;
    cursor.style.width = `${r.width}px`;
    cursor.style.height = `${r.height}px`;
  }

  render() {
    const styles = {
      width: '100%',
      height: this.props.height,
    };
    return (
      <div className="event-grid-bg-wrap">
        <div ref="cursor" className="cursor" />
        <canvas ref="canvas" className="event-grid-bg" style={styles} />
      </div>
    );
  }
}
