import React from 'react';
import { localized } from 'mailspring-exports';
import { AuditEntry, getAuditLog, clearAuditLog, onAuditLogChanged } from './mcp-tools';

interface State {
  entries: AuditEntry[];
}

export default class PreferencesMcpAudit extends React.Component<Record<string, never>, State> {
  _unsub: (() => void) | null = null;

  state: State = { entries: getAuditLog() };

  componentDidMount() {
    this._unsub = onAuditLogChanged(() => {
      this.setState({ entries: getAuditLog() });
    });
  }

  componentWillUnmount() {
    this._unsub?.();
  }

  _formatTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  render() {
    const { entries } = this.state;
    return (
      <div className="mcp-audit">
        <div className="mcp-audit-header">
          <h6>{localized('Activity Log')}</h6>
          <button className="btn btn-small" onClick={clearAuditLog}>
            {localized('Clear Log')}
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="mcp-audit-empty">{localized('No tool calls recorded yet.')}</div>
        ) : (
          <div className="mcp-audit-table">
            <table>
              <thead>
                <tr>
                  <th>{localized('Time')}</th>
                  <th>{localized('Tool')}</th>
                  <th>{localized('Parameters')}</th>
                  <th>{localized('Result')}</th>
                  <th>{localized('Duration')}</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((entry, i) => (
                  <tr key={i}>
                    <td title={new Date(entry.timestamp).toLocaleString()}>
                      {this._formatTime(entry.timestamp)}
                    </td>
                    <td>{entry.toolName}</td>
                    <td className="mcp-audit-params" title={entry.params}>
                      {entry.params.slice(0, 100)}
                    </td>
                    <td>{entry.resultSummary}</td>
                    <td>{entry.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
}
