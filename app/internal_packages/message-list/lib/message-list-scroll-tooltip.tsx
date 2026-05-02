import React from 'react';
import { localized, PropTypes, Utils } from 'mailspring-exports';

export class MessageListScrollTooltip extends React.Component<
  { viewportCenter: number; totalHeight: number },
  { idx: number; count: number }
> {
  static displayName = 'MessageListScrollTooltip';
  static propTypes = {
    viewportCenter: PropTypes.number.isRequired,
    totalHeight: PropTypes.number.isRequired,
  };

  state = { idx: 0, count: 0 };

  componentDidMount() {
    this.setupForProps(this.props);
  }

  componentDidUpdate(prevProps: { viewportCenter: number; totalHeight: number }) {
    if (prevProps.viewportCenter !== this.props.viewportCenter) {
      this.setupForProps(this.props);
    }
  }

  shouldComponentUpdate(
    newProps: { viewportCenter: number; totalHeight: number },
    newState: { idx: number; count: number }
  ) {
    return !Utils.isEqualReact(this.state, newState);
  }

  setupForProps(props: { viewportCenter: number; totalHeight: number }) {
    // Technically, we could have MessageList provide the currently visible
    // item index, but the DOM approach is simple and self-contained.
    //
    const els = document.querySelectorAll('.message-item-wrap');
    let idx = Array.from(els).findIndex(
      (el) => (el as HTMLElement).offsetTop > props.viewportCenter
    );
    if (idx === -1) {
      idx = els.length;
    }

    this.setState({
      idx: idx,
      count: els.length,
    });
  }

  render() {
    return (
      <div className="scroll-tooltip">
        {localized('%1$@ of %2$@', this.state.idx, this.state.count)}
      </div>
    );
  }
}
