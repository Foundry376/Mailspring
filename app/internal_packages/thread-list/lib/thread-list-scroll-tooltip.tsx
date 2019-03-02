import React from 'react';
import { localized, PropTypes, DateUtils, Thread } from 'mailspring-exports';
import { ScrollRegionTooltipComponentProps } from 'mailspring-component-kit';
import ThreadListStore from './thread-list-store';

class ThreadListScrollTooltip extends React.Component<
  ScrollRegionTooltipComponentProps,
  { item?: Thread; idx: number }
> {
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
      item: ThreadListStore.dataSource().get(idx) as any,
    });
  }

  render() {
    let content;
    if (this.state.item) {
      content = DateUtils.shortTimeString(this.state.item.lastMessageReceivedTimestamp);
    } else {
      content = localized('Loading...');
    }
    return <div className="scroll-tooltip">{content}</div>;
  }
}

export default ThreadListScrollTooltip;
