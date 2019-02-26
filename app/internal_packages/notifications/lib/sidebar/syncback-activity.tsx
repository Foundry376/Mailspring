import { localized, React, Utils, PropTypes } from 'mailspring-exports';

export default class SyncbackActivity extends React.Component {
  static propTypes = {
    tasks: PropTypes.array,
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  render() {
    const { tasks } = this.props;
    if (!tasks || tasks.length === 0) {
      return false;
    }

    const counts = {};
    this.props.tasks.forEach(task => {
      const label = task.label ? task.label() : null;
      if (!label) {
        return;
      }
      if (!counts[label]) {
        counts[label] = 0;
      }
      counts[label] += +task.numberOfImpactedItems();
    });

    const items = Object.entries(counts).map(([label, count]) => {
      return (
        <div className="item" key={label}>
          <div className="inner">
            <span className="count">({count.toLocaleString()})</span>
            {`${label}...`}
          </div>
        </div>
      );
    });

    if (items.length === 0) {
      items.push(
        <div className="item" key="no-labels">
          <div className="inner">{localized(`Applying changes...`)}</div>
        </div>
      );
    }

    return <div>{items}</div>;
  }
}
