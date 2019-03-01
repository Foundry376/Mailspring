import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, isRTL } from 'mailspring-exports';
import { SubjectStatsEntry } from './root';

export class MetricContainer extends React.Component<{ name: string }> {
  render() {
    return (
      <div className="metric-container">
        {this.props.children}
        <div className="footer">{this.props.name}</div>
      </div>
    );
  }
}

export class MetricStat extends React.Component<{
  name: string;
  units: string;
  value: number;
  loading: boolean;
}> {
  _el: HTMLDivElement;

  render() {
    const { value, units, name } = this.props;

    return (
      <div className={`metric-stat ${name}`} ref={el => (this._el = el)}>
        <div
          className="layer hidden-on-web"
          style={{
            zIndex: 1,
            padding: `15px 5px`,
            textAlign: isRTL ? 'left' : 'right',
          }}
        >
          <RetinaImg name={`metric-background-${name}.png`} mode={RetinaImg.Mode.ContentIsMask} />
        </div>
        <div
          className="layer text-overlay"
          style={{
            zIndex: 3,
          }}
        >
          <div className="text">{`${(value / 1).toLocaleString()}${units}`}</div>
        </div>
      </div>
    );
  }
}

export class MetricHistogram extends React.Component<{
  loading: boolean;
  values: number[];
  left: React.ReactChild;
  right: React.ReactChild;
}> {
  _el: HTMLDivElement;

  componentDidMount() {
    if (!this.props.loading) {
      window.requestAnimationFrame(() => this._el && this._el.classList.add('visible'));
    }
  }

  render() {
    const { values, left, right } = this.props;
    let max = 0;
    for (const v of values) {
      max = Math.max(v, max);
    }

    return (
      <div className="metric-histogram" ref={el => (this._el = el)}>
        <div className="legend">
          <div>{left}</div>
          <div style={{ flex: 1 }} />
          <div>{right}</div>
        </div>
        <div className="layer" style={{ zIndex: 2, top: '20%' }}>
          {values.map((value, idx) => (
            <div
              key={idx}
              className="column"
              style={{
                transitionDelay: `${idx * Math.round(800 / values.length)}ms`,
                left: `${(idx + 1) / values.length * 100}%`,
                height: `${value / max * 100}%`,
                width: `${100 / values.length}%`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }
}

export class MetricGraph extends React.Component<{ loading: boolean; values: number[] }> {
  _el: HTMLDivElement;

  componentDidMount() {
    if (!this.props.loading) {
      window.setTimeout(() => this._el && this._el.classList.add('visible'), 50);
    }
  }

  render() {
    const { values } = this.props;
    const total = values.reduce((a, sum) => (sum += a), 0);
    const maxValue = Math.max(...values) || 1;
    const step = 100.0 / values.length;

    const pointsForSvg = values
      .reverse()
      .map((v, idx) => [(values.length - idx) * step, (maxValue - v) / maxValue * 10]);

    // make a little diamond at the end
    if (pointsForSvg[0]) {
      const [fx, fy] = pointsForSvg[0];
      const diamondRadius = 0.45;
      pointsForSvg.unshift([fx - diamondRadius, fy]);
      pointsForSvg.unshift([fx, fy - diamondRadius]);
      pointsForSvg.unshift([fx + diamondRadius, fy]);
      pointsForSvg.unshift([fx, fy + diamondRadius]);
      pointsForSvg.unshift([fx - diamondRadius, fy]);
    } else {
      // avoid rendering an invalid SVG by making a single point
      pointsForSvg[0] = [0, 0];
    }

    return (
      <div className="metric-graph" ref={el => (this._el = el)}>
        <div className="layer" style={{ zIndex: 1 }}>
          {values.map((_, idx) => (
            <div
              key={idx}
              className="gridline"
              style={{ left: `${(idx + 1) / values.length * 100}%` }}
            />
          ))}
        </div>
        <svg
          className="layer"
          style={{ zIndex: 2, overflow: 'visible' }}
          width="100%"
          height="100%"
          viewBox={`0 0 100 10`}
          version="1.1"
        >
          <path d={`M${pointsForSvg.map(([x, y]) => `${x},${y}`).join(' L')}`} />
        </svg>
        <div
          className="layer text-overlay"
          style={{
            zIndex: 3,
          }}
        >
          <div className="text">{(total / 1).toLocaleString()}</div>
        </div>
      </div>
    );
  }
}

export class MetricsBySubjectTable extends React.Component<{ data: SubjectStatsEntry[] }> {
  render() {
    const { data } = this.props;

    return (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{localized('Subject Line')}</th>
              <th style={{ width: '11vw' }}>{localized('Messages Sent')}</th>
              <th style={{ width: '9vw' }}>{localized('Open Rate')}</th>
              <th style={{ width: '11vw' }}>{localized('Link Click Rate')}</th>
              <th style={{ width: '9vw' }}>{localized('Reply Rate')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map(({ subject, count, opens, clicks, replies }) => (
              <tr key={subject}>
                <td className="ellipsis">
                  <span title={subject}>{subject}</span>
                </td>
                <td>{count}</td>
                <td>
                  {opens ? (
                    `${Math.ceil(opens / count * 100)}% (${opens})`
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
                <td>
                  {clicks ? (
                    `${Math.ceil(clicks / count * 100)}% (${clicks})`
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
                <td>
                  {replies ? (
                    `${Math.ceil(replies / count * 100)}% (${replies})`
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
