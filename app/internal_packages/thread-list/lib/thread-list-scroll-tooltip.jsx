const { React, PropTypes, DateUtils } = require('mailspring-exports');
const ThreadListStore = require('./thread-list-store');

class ThreadListScrollTooltip extends React.Component {
  static displayName = 'ThreadListScrollTooltip';
  static propTypes = {
    viewportCenter: PropTypes.number.isRequired,
    totalHeight: PropTypes.number.isRequired,
  };

  componentWillMount() {
    this.setupForProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setupForProps(newProps);
  }

  shouldComponentUpdate(newProps, newState) {
    return (this.state != null ? this.state.idx : undefined) !== newState.idx;
  }

  setupForProps(props) {
    const idx = Math.floor(
      ThreadListStore.dataSource().count() / this.props.totalHeight * this.props.viewportCenter
    );
    this.setState({
      idx,
      item: ThreadListStore.dataSource().get(idx),
    });
  }

  render() {
    let content;
    if (this.state.item) {
      content = DateUtils.shortTimeString(this.state.item.lastMessageReceivedTimestamp);
    } else {
      content = 'Loading...';
    }
    return <div className="scroll-tooltip">{content}</div>;
  }
}

module.exports = ThreadListScrollTooltip;
