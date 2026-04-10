import React from 'react';
import { localized, Utils, PropTypes, Actions, GetManyRFC2822Task } from 'mailspring-exports';

export class ExportActivity extends React.Component<{ tasks: any[] }> {
  static propTypes = {
    tasks: PropTypes.array,
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  _onCancel = (taskId: string) => {
    Actions.cancelTask(taskId);
  };

  render() {
    const { tasks } = this.props;
    if (!tasks || tasks.length === 0) {
      return null;
    }

    const items = tasks.map((task: InstanceType<typeof GetManyRFC2822Task>) => {
      const result = task.result || {};
      const total = result.total || 0;
      const exported = result.exported || 0;
      const failed = result.failed || 0;
      const pct = total > 0 ? Math.round((exported / total) * 100) : 0;

      let statusText: string;
      if (total === 0) {
        statusText = localized('Preparing export...');
      } else if (failed > 0) {
        statusText = localized('Exporting... %1$@ / %2$@ (%3$@ failed)', exported, total, failed);
      } else {
        statusText = localized('Exporting... %1$@ / %2$@', exported, total);
      }

      return (
        <div className="item" key={task.id}>
          <div className="inner">
            {statusText}
            {total > 0 && (
              <div
                style={{
                  marginTop: 4,
                  height: 3,
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 1.5,
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'rgba(255,255,255,0.65)',
                    borderRadius: 1.5,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      );
    });

    return <div>{items}</div>;
  }
}
