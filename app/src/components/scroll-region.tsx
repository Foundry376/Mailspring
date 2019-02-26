import _ from 'underscore';
import { React, ReactDOM, PropTypes, Utils, isRTL } from 'mailspring-exports';;
import classNames from 'classnames';
import ScrollbarTicks from './scrollbar-ticks';

class Scrollbar extends React.Component {
  static displayName = 'Scrollbar';
  static propTypes = {
    scrollTooltipComponent: PropTypes.func,
    // A scrollbarTickProvider is any object that has the `listen` and
    // `scrollbarTicks` method. Since ScrollRegions tend to encompass large
    // render trees it's more efficent for the scrollbar to listen for its
    // own state then have it passed down as new props and potentially
    // cause re-renders of the whole scroll region. The `scrollbarTicks`
    // method must return an array of numbers between 0 and 1 which
    // represent the height percentages at which tick marks will be
    // rendered.
    scrollbarTickProvider: PropTypes.object,
    getScrollRegion: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this._heightObserver = null;
    this.state = {
      totalHeight: 0,
      trackHeight: 0,
      viewportHeight: 0,
      viewportScrollTop: 0,
      dragging: false,
      scrolling: false,
      scrollbarTicks: [],
    };
  }

  componentDidMount() {
    const trackEl = ReactDOM.findDOMNode(this.refs.track);

    if (this.props.scrollbarTickProvider && this.props.scrollbarTickProvider.listen) {
      this._tickUnsub = this.props.scrollbarTickProvider.listen(this._onTickProviderChange);
    }

    // Set and then monitor our trackHeight via a ResizeObserver
    this._heightObserver = new ResizeObserver(entries => {
      if (entries[0] && this.state.trackHeight === entries[0].contentRect.height) return;
      this.setState({ trackHeight: entries[0].contentRect.height });
    });
    this._heightObserver.observe(trackEl);
    this.setState({ trackHeight: trackEl.clientHeight });
  }

  componentWillUnmount() {
    this._onHandleUp({ preventDefault() {} });
    if (this._heightObserver) this._heightObserver.disconnect();
    if (this._tickUnsub) this._tickUnsub();
  }

  render() {
    const containerClasses = classNames({
      'scrollbar-track': true,
      dragging: this.state.dragging,
      scrolling: this.state.scrolling,
      'with-ticks': this.state.scrollbarTicks.length > 0,
    });

    let tooltip = [];
    if (this.props.scrollTooltipComponent && this.state.dragging) {
      tooltip = (
        <this.props.scrollTooltipComponent
          viewportCenter={this.state.viewportScrollTop + this.state.viewportHeight / 2}
          totalHeight={this.state.totalHeight}
        />
      );
    }

    return (
      <div className={containerClasses} style={this._scrollbarWrapStyles()}>
        <div className="scrollbar-track-inner" ref="track" onClick={this._onScrollJump}>
          {this._renderScrollbarTicks()}
          <div
            className="scrollbar-handle"
            onMouseDown={this._onHandleDown}
            style={this._scrollbarHandleStyles()}
            ref="handle"
            onClick={this._onHandleClick}
          >
            <div className="tooltip">{tooltip}</div>
          </div>
        </div>
      </div>
    );
  }

  _onTickProviderChange = () => {
    if (
      !(this.props.scrollbarTickProvider != null
        ? this.props.scrollbarTickProvider.scrollbarTicks
        : undefined)
    ) {
      throw new Error('The scrollbarTickProvider must implement `scrollbarTicks`');
    }
    this.setState({ scrollbarTicks: this.props.scrollbarTickProvider.scrollbarTicks() });
  };

  _renderScrollbarTicks() {
    if (!(this.state.scrollbarTicks.length > 0)) {
      return false;
    }
    return <ScrollbarTicks ticks={this.state.scrollbarTicks} />;
  }

  _scrollbarHandleStyles = () => {
    const handleHeight = this._getHandleHeight();
    const handleTop =
      this.state.viewportScrollTop /
      (this.state.totalHeight - this.state.viewportHeight) *
      (this.state.trackHeight - handleHeight);

    return {
      position: 'relative',
      height: handleHeight || 0,
      transform: `translate3d(0, ${Math.floor(handleTop)}px, 0)`,
    };
  };

  _scrollbarWrapStyles = () => {
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      [isRTL ? 'left' : 'right']: 0,
      zIndex: 2,
      visibility:
        this.state.totalHeight !== 0 && this.state.totalHeight === this.state.viewportHeight
          ? 'hidden'
          : undefined,
    };
  };

  _onHandleDown = event => {
    const handleNode = ReactDOM.findDOMNode(this.refs.handle);
    this._trackOffset = ReactDOM.findDOMNode(this.refs.track).getBoundingClientRect().top;
    this._mouseOffsetWithinHandle = event.pageY - handleNode.getBoundingClientRect().top;
    window.addEventListener('mousemove', this._onHandleMove);
    window.addEventListener('mouseup', this._onHandleUp);
    this.setState({ dragging: true });
    event.preventDefault();
  };

  _onHandleMove = event => {
    const trackY = event.pageY - this._trackOffset - this._mouseOffsetWithinHandle;
    const trackPxToViewportPx =
      (this.state.totalHeight - this.state.viewportHeight) /
      (this.state.trackHeight - this._getHandleHeight());
    this.props.getScrollRegion().scrollTop = trackY * trackPxToViewportPx;
    event.preventDefault();
  };

  _onHandleUp = event => {
    window.removeEventListener('mousemove', this._onHandleMove);
    window.removeEventListener('mouseup', this._onHandleUp);
    this.setState({ dragging: false });
    event.preventDefault();
  };

  _onHandleClick = event => {
    // Avoid event propogating up to track
    event.stopPropagation();
  };

  _onScrollJump = event => {
    this._trackOffset = ReactDOM.findDOMNode(this.refs.track).getBoundingClientRect().top;
    this._mouseOffsetWithinHandle = this._getHandleHeight() / 2;
    this._onHandleMove(event);
  };

  _getHandleHeight = () => {
    return Math.min(
      this.state.totalHeight,
      Math.max(40, this.state.trackHeight / this.state.totalHeight * this.state.trackHeight)
    );
  };
}

/*
The ScrollRegion component attaches a custom scrollbar.
*/
class ScrollRegion extends React.Component {
  static displayName = 'ScrollRegion';

  static propTypes = {
    onScroll: PropTypes.func,
    onScrollEnd: PropTypes.func,
    className: PropTypes.string,
    scrollTooltipComponent: PropTypes.func,
    scrollbarTickProvider: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.element, PropTypes.array]),
    getScrollbar: PropTypes.func,
  };

  // Concept from https://developer.apple.com/library/prerelease/ios/documentation/UIKit/Reference/UITableView_Class/#//apple_ref/c/tdef/UITableViewScrollPosition

  static ScrollPosition = {
    // Scroll so that the desired region is at the top of the viewport
    Top: 'Top',
    // Scroll so that the desired region is at the bottom of the viewport
    Bottom: 'Bottom',
    // Scroll so that the desired region is visible in the viewport, with the
    // least movement possible.
    Visible: 'Visible',
    // Scroll so that the desired region is centered in the viewport
    Center: 'Center',
    // Scroll so that the desired region is centered in the viewport, only if it
    // is currently not visible
    CenterIfInvisible: 'CenterIfInvisible',
  };

  constructor(props) {
    super(props);

    this._scrollToTaskId = 0;
    this._scrollbarComponent = null;
    this._totalHeightObserver = null;
    this._viewportHeightObserver = null;
    this.state = {
      totalHeight: 0,
      viewportHeight: 0,
      viewportScrollTop: 0,
      scrolling: false,
    };

    Object.defineProperty(this, 'scrollTop', {
      get() {
        return ReactDOM.findDOMNode(this.refs.content).scrollTop;
      },
      set(val) {
        ReactDOM.findDOMNode(this.refs.content).scrollTop = val;
      },
    });
  }

  componentDidMount() {
    this._mounted = true;

    const viewportEl = ReactDOM.findDOMNode(this.refs.content);
    const innerWrapperEl = ReactDOM.findDOMNode(this.refs.inner);

    this._viewportHeightObserver = new ResizeObserver(entries => {
      if (entries[0] && entries[0].contentRect.height !== this.state.viewportHeight) {
        this._setSharedState({ viewportHeight: entries[0].contentRect.height });
      }
    });
    this._totalHeightObserver = new ResizeObserver(entries => {
      // Note: we need to use target.clientHeight because the inner element can have padding
      // and the contentRect.height is the inner padded size, not the bounding box size.
      if (entries[0] && entries[0].contentRect.height !== this.state.totalHeight) {
        this._setSharedState({ totalHeight: entries[0].target.clientHeight });
      }
    });

    this._totalHeightObserver.observe(innerWrapperEl);
    this._viewportHeightObserver.observe(viewportEl);

    this._setSharedState({
      viewportScrollTop: 0,
      viewportHeight: viewportEl.clientHeight,
      totalHeight: innerWrapperEl.clientHeight,
    });
  }

  componentWillReceiveProps(props) {
    if (this.shouldInvalidateScrollbarComponent(props)) {
      this._scrollbarComponent = null;
    }
  }

  componentWillUnmount() {
    if (this._totalHeightObserver) this._totalHeightObserver.disconnect();
    if (this._viewportHeightObserver) this._viewportHeightObserver.disconnect();
    this._mounted = false;
  }

  shouldInvalidateScrollbarComponent = newProps => {
    if (newProps.scrollTooltipComponent !== this.props.scrollTooltipComponent) {
      return true;
    }
    if (newProps.getScrollbar !== this.props.getScrollbar) {
      return true;
    }
    return false;
  };

  render() {
    const containerClasses =
      `${this.props.className != null ? this.props.className : ''} ` +
      classNames({
        'scroll-region': true,
        dragging: this.state.dragging,
        scrolling: this.state.scrolling,
      });

    if (!this.props.getScrollbar) {
      if (this._scrollbarComponent == null) {
        this._scrollbarComponent = (
          <Scrollbar
            ref="scrollbar"
            scrollbarTickProvider={this.props.scrollbarTickProvider}
            scrollTooltipComponent={this.props.scrollTooltipComponent}
            getScrollRegion={this._getSelf}
          />
        );
      }
    }

    const otherProps = Utils.fastOmit(this.props, Object.keys(this.constructor.propTypes));

    return (
      <div className={containerClasses} {...otherProps}>
        {this._scrollbarComponent}
        <div className="scroll-region-content" onScroll={this._onScroll} ref="content">
          <div className="scroll-region-content-inner" ref="inner">
            {this.props.children}
          </div>
        </div>
      </div>
    );
  }

  // Public: Scroll to the DOM Node provided.
  //
  scrollTo = (node, param = {}) => {
    const { position, settle, done } = param;
    if (node instanceof React.Component) {
      node = ReactDOM.findDOMNode(node);
    }
    if (!(node instanceof Node)) {
      throw new Error(
        'ScrollRegion.scrollTo: requires a DOM node or React element. Maybe you meant scrollToRect?'
      );
    }
    window.requestAnimationFrame(() => {
      this._scroll({ position, settle, done }, () => node.getBoundingClientRect());
    });
  };

  // Public: Scroll to the client rectangle provided. Note: This method expects
  // a ClientRect or similar object with top, left, width, height relative to the
  // window, not the scroll region. This is designed to make it easy to use with
  // node.getBoundingClientRect()
  scrollToRect(rect, param = {}) {
    const { position, settle, done } = param;
    if (rect instanceof Node) {
      throw new Error('ScrollRegion.scrollToRect: requires a rect. Maybe you meant scrollTo?');
    }
    if (rect.top == null || rect.height == null) {
      throw new Error(
        'ScrollRegion.scrollToRect: requires a rect with `top` and `height` attributes.'
      );
    }
    window.requestAnimationFrame(() => {
      this._scroll({ position, settle, done }, () => rect);
    });
  }

  _scroll({ position, settle, done }, clientRectProviderCallback) {
    let settleFn;
    const contentNode = ReactDOM.findDOMNode(this.refs.content);
    if (position == null) {
      position = ScrollRegion.ScrollPosition.Visible;
    }

    if (settle === true) {
      settleFn = this._settleHeight;
    } else {
      settleFn = callback => callback();
    }

    this._scrollToTaskId += 1;
    const taskId = this._scrollToTaskId;

    settleFn(() => {
      // If another scroll call has been made since ours, don't do anything.
      if (this._scrollToTaskId !== taskId || !contentNode) {
        return typeof done === 'function' ? done(false) : undefined;
      }

      const contentClientRect = contentNode.getBoundingClientRect();
      const rect = _.clone(clientRectProviderCallback());
      if (!rect || !contentClientRect) return;

      // For sanity's sake, convert the client rectangle we get into a rect
      // relative to the contentRect of our scroll region.
      rect.top = rect.top - contentClientRect.top + contentNode.scrollTop;
      rect.bottom = rect.bottom - contentClientRect.top + contentNode.scrollTop;

      // Also give ourselves a representation of the visible region, in the same
      // coordinate space as `rect`
      const contentVisibleRect = _.clone(contentClientRect);
      contentVisibleRect.top += contentNode.scrollTop;
      contentVisibleRect.bottom += contentNode.scrollTop;

      if (position === ScrollRegion.ScrollPosition.Top) {
        this.scrollTop = rect.top;
      } else if (position === ScrollRegion.ScrollPosition.Bottom) {
        this.scrollTop = rect.top + rect.height - contentClientRect.height;
      } else if (position === ScrollRegion.ScrollPosition.Center) {
        this.scrollTop = rect.top - (contentClientRect.height - rect.height) / 2;
      } else if (position === ScrollRegion.ScrollPosition.CenterIfInvisible) {
        if (!Utils.rectVisibleInRect(rect, contentVisibleRect)) {
          this.scrollTop = rect.top - (contentClientRect.height - rect.height) / 2;
        }
      } else if (position === ScrollRegion.ScrollPosition.Visible) {
        const distanceBelowBottom =
          rect.top + rect.height - (contentClientRect.height + contentNode.scrollTop);
        const distanceAboveTop = this.scrollTop - rect.top;
        if (distanceBelowBottom >= 0) {
          this.scrollTop += distanceBelowBottom;
        } else if (distanceAboveTop >= 0) {
          this.scrollTop -= distanceAboveTop;
        }
      }

      if (done) {
        done(true);
      }
    });
  }

  _settleHeight = callback => {
    const contentNode = ReactDOM.findDOMNode(this.refs.content);
    let lastContentHeight = -1;
    var scrollIfSettled = () => {
      if (!this._mounted) {
        return;
      }
      const contentRect = contentNode.getBoundingClientRect();
      if (contentRect.height !== lastContentHeight) {
        lastContentHeight = contentRect.height;
      } else {
        return callback();
      }
      window.requestAnimationFrame(scrollIfSettled);
    };
    scrollIfSettled();
  };

  _setSharedState(state) {
    const scrollbar = this.props.getScrollbar ? this.props.getScrollbar() : this.refs.scrollbar;
    if (scrollbar) scrollbar.setState(state);
    this.setState(state);
  }

  _onScroll = event => {
    // onScroll events propogate, which is a bit strange. We could actually be
    // receiving a scroll event for a textarea inside the scroll region.
    // See Preferences > Signatures > textarea
    if (event.target !== ReactDOM.findDOMNode(this.refs.content)) {
      return;
    }

    this._setSharedState({ scrolling: true, viewportScrollTop: event.target.scrollTop });

    if (typeof this.props.onScroll === 'function') {
      this.props.onScroll(event);
    }

    if (this._onScrollEnd == null) {
      this._onScrollEnd = _.debounce(() => {
        this._setSharedState({ scrolling: false });
        if (this.props.onScrollEnd) {
          this.props.onScrollEnd(event);
        }
      }, 250);
    }
    this._onScrollEnd();
  };

  _getSelf = () => {
    return this;
  };
}

ScrollRegion.Scrollbar = Scrollbar;

export default ScrollRegion;
