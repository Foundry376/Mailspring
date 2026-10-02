import React, { useEffect, useState } from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { LinkStatsEntry, SubjectStatsEntry } from './root';

/**
 * Reveal transitions live only on the `.visible` state, so dropping the flag
 * while loading (under the cover) resets instantly. It is restored two frames
 * after fresh data commits: passive effects run after paint, and the first
 * frame can still precede the clipped state being painted.
 */
function useRevealed(loading: boolean) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (loading) {
      setRevealed(false);
      return;
    }
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => setRevealed(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  return revealed;
}

/**
 * The unit of the reports grid: a bordered surface with the title top-left, an
 * optional headline value and detail line beneath it, and the chart or table
 * below. `full` spans the entire grid row.
 */
export function MetricCard({
  title,
  value,
  detail,
  full,
  children,
}: {
  title: string;
  value?: string;
  detail?: string;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={classnames('metric-card', { full })}>
      <div className="metric-card-title">{title}</div>
      {value !== undefined && <div className="metric-card-value">{value}</div>}
      {detail && <div className="metric-card-detail">{detail}</div>}
      {children && <div className="metric-card-body">{children}</div>}
    </div>
  );
}

export function MetricEmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="metric-empty-note">{children}</div>;
}

function AxisLabels({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="axis-labels">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

type Point = [number, number];

/** Splits a day series into runs of consecutive plotted points; null values are gaps. */
function plotSegments(values: (number | null)[]): Point[][] {
  // A single sample still reads as a flat line rather than a point.
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const max = Math.max(0, ...series.map((v) => v || 0)) || 1;
  const step = 100 / Math.max(1, series.length - 1);

  const segments: Point[][] = [];
  let current: Point[] = [];
  series.forEach((v, idx) => {
    if (v === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push([idx * step, ((max - v) / max) * 100]);
  });
  if (current.length) segments.push(current);
  return segments;
}

/** Line chart of one value per day across the timespan. */
export function MetricGraph({
  loading,
  values,
  left,
  right,
}: {
  loading: boolean;
  values: (number | null)[];
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const revealed = useRevealed(loading);
  const segments = plotSegments(values);
  const toPath = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).join(' L');
  const last = segments.length ? segments[segments.length - 1] : [];
  const [endX, endY] = last.length ? last[last.length - 1] : [100, 100];

  return (
    <div className={classnames('metric-graph', { visible: revealed })}>
      <div className="plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {segments.map((points, idx) => {
            const [firstX] = points[0];
            const [lastX] = points[points.length - 1];
            return (
              <React.Fragment key={idx}>
                <path className="area" d={`M${firstX},100 L${toPath(points)} L${lastX},100 Z`} />
                <path className="line" d={`M${toPath(points)}`} />
              </React.Fragment>
            );
          })}
        </svg>
        {last.length > 0 && (
          <div className="marker" style={{ left: `${endX}%`, top: `${endY}%` }} />
        )}
      </div>
      <AxisLabels left={left} right={right} />
    </div>
  );
}

export interface MetricBucket {
  label: string;
  value: number;
  /** Tooltip; typically the raw counts behind a rate. */
  detail?: string;
}

/** Bar chart for a handful of buckets, e.g. delay ranges, hours, or weekdays. */
export function MetricBuckets({
  loading,
  buckets,
  formatValue,
}: {
  loading: boolean;
  buckets: MetricBucket[];
  /** Formats the value shown above each bar; omit to show nothing. */
  formatValue?: (value: number) => string;
}) {
  const revealed = useRevealed(loading);
  const max = Math.max(0, ...buckets.map((b) => b.value)) || 1;
  const delayStep = Math.round(600 / (buckets.length || 1));

  return (
    <div className={classnames('metric-buckets', { visible: revealed })}>
      {buckets.map((bucket, idx) => (
        // Labels are not unique: hourly charts leave most of them blank.
        <div key={idx} className="bucket" title={bucket.detail}>
          <div className="value">
            {formatValue && bucket.value > 0 ? formatValue(bucket.value) : ''}
          </div>
          <div className="bar-area">
            <div
              className={classnames('column', { empty: bucket.value === 0 })}
              style={{
                transitionDelay: `${idx * delayStep}ms`,
                height: `${(bucket.value / max) * 100}%`,
              }}
            />
          </div>
          <div className="label">{bucket.label}</div>
        </div>
      ))}
    </div>
  );
}

function RateCell({ numerator, denominator }: { numerator: number; denominator: number }) {
  if (!numerator) {
    return <span className="empty">—</span>;
  }
  return <>{`${Math.round((numerator / denominator) * 100)}% (${numerator})`}</>;
}

export function MetricsBySubjectTable({ data }: { data: SubjectStatsEntry[] }) {
  return (
    <table className="metric-table">
      <thead>
        <tr>
          <th>{localized('Subject Line')}</th>
          <th className="numeric">{localized('Messages Sent')}</th>
          <th className="numeric">{localized('Open Rate')}</th>
          <th className="numeric">{localized('Link Click Rate')}</th>
          <th className="numeric">{localized('Reply Rate')}</th>
        </tr>
      </thead>
      <tbody>
        {data.map(({ subject, count, opens, clicks, replies }) => (
          <tr key={subject}>
            <td className="ellipsis">
              <span title={subject}>{subject}</span>
            </td>
            <td className="numeric">{count}</td>
            <td className="numeric">
              <RateCell numerator={opens} denominator={count} />
            </td>
            <td className="numeric">
              <RateCell numerator={clicks} denominator={count} />
            </td>
            <td className="numeric">
              <RateCell numerator={replies} denominator={count} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MetricsByLinkTable({ data }: { data: LinkStatsEntry[] }) {
  return (
    <table className="metric-table">
      <thead>
        <tr>
          <th>{localized('Link')}</th>
          <th className="numeric">{localized('Messages Sent')}</th>
          <th className="numeric">{localized('Link Click Rate')}</th>
          <th className="numeric">{localized('Total Clicks')}</th>
        </tr>
      </thead>
      <tbody>
        {data.map(({ url, count, messagesClicked, clicks }) => (
          <tr key={url}>
            <td className="ellipsis">
              <span title={url}>{url}</span>
            </td>
            <td className="numeric">{count}</td>
            <td className="numeric">
              <RateCell numerator={messagesClicked} denominator={count} />
            </td>
            <td className="numeric">{clicks || <span className="empty">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
