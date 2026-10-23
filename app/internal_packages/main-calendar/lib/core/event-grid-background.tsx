import React from 'react';
import ReactDOM from 'react-dom';
import { Utils } from 'mailspring-exports';
import { tickGenerator } from './week-view-helpers';

interface EventGridBackgroundProps {
  height: number;
  numColumns: number;
  intervalHeight: number;
  /** See MailspringCalendarViewProps.paintVersion; the canvas reads the theme's line colours only when it paints. */
  paintVersion: string;
}

export class EventGridBackground extends React.Component<EventGridBackgroundProps> {
  static displayName = 'EventGridBackground';

  _lastHoverRect: { x?; y?; width?; height? } = {};

  componentDidMount() {
    this._renderEventGridBackground();
  }

  shouldComponentUpdate(nextProps: EventGridBackgroundProps, nextState: Record<string, never>) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    this._renderEventGridBackground();
  }

  _renderEventGridBackground() {
    const canvas = ReactDOM.findDOMNode(this.refs.canvas) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Drawn at the screen's resolution, or a Retina display stretches each line soft.
    canvas.height = this.props.height * window.devicePixelRatio;
    ctx.setTransform(1, 0, 0, window.devicePixelRatio, 0, 0);

    const wrapStyle = getComputedStyle(canvas.parentElement);
    ctx.strokeStyle = wrapStyle.getPropertyValue('--grid-line').trim() || '#e0e0e0';
    ctx.beginPath();
    for (const { y } of tickGenerator(this.props.intervalHeight)) {
      // Centred on a pixel row so the 1px line isn't spread across two at half strength.
      const lineY = Math.round(y) + 0.5;
      ctx.moveTo(0, lineY);
      ctx.lineTo(canvas.width, lineY);
    }
    ctx.stroke();
  }

  onMouseMove(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const width = e.currentTarget.clientWidth;
    const x = e.clientX;
    const y = e.clientY;

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
      <div className="event-grid-bg-wrap" onMouseMove={this.onMouseMove}>
        <div ref="cursor" className="cursor" />
        <canvas ref="canvas" className="event-grid-bg" style={styles} />
      </div>
    );
  }
}
