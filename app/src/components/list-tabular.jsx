import _ from 'underscore';
import React, { Component } from 'react';
import { Utils, ComponentRegistry } from 'mailspring-exports';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {
  FocusedPerspectiveStore,
} from 'mailspring-exports';

import ScrollRegion from './scroll-region';
import Spinner from './spinner';

import ListDataSource from './list-data-source';
import ListSelection from './list-selection';
import ListTabularItem from './list-tabular-item';

class ListColumn {
  constructor({ name, resolver, flex, width }) {
    this.name = name;
    this.resolver = resolver;
    this.flex = flex;
    this.width = width;
  }
}

class ListTabularRows extends Component {
  static displayName = 'ListTabularRows';

  static propTypes = {
    rows: PropTypes.array,
    columns: PropTypes.array.isRequired,
    draggable: PropTypes.bool,
    itemHeight: PropTypes.number,
    innerStyles: PropTypes.object,
    onSelect: PropTypes.func,
    onClick: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onDragStart: PropTypes.func,
    onDragEnd: PropTypes.func,
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  renderRow({ item, idx, itemProps = {} } = {}) {
    if (!item) {
      return false;
    }
    const { columns, itemHeight, onClick, onSelect, onDoubleClick, offsetHeight = 0 } = this.props;
    return (
      <ListTabularItem
        key={item.id || idx}
        item={item}
        itemProps={itemProps}
        metrics={{ top: idx * itemHeight + offsetHeight, height: itemHeight }}
        columns={columns}
        onSelect={onSelect}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }

  render() {
    const { rows, innerStyles, draggable, onDragStart, onDragEnd } = this.props;
    return (
      <div
        className="list-rows"
        style={innerStyles}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        draggable={draggable}
      >
        {rows.map(r => this.renderRow(r))}
      </div>
    );
  }
}

class ListTabular extends Component {
  static displayName = 'ListTabular';

  static propTypes = {
    footer: PropTypes.node,
    draggable: PropTypes.bool,
    className: PropTypes.string,
    columns: PropTypes.array.isRequired,
    dataSource: PropTypes.object,
    itemPropsProvider: PropTypes.func,
    itemHeight: PropTypes.number,
    EmptyComponent: PropTypes.func,
    scrollTooltipComponent: PropTypes.func,
    onClick: PropTypes.func,
    onSelect: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onDragStart: PropTypes.func,
    onDragEnd: PropTypes.func,
    onComponentDidUpdate: PropTypes.func,
  };

  static defaultProps = {
    footer: false,
    EmptyComponent: () => false,
    itemPropsProvider: () => ({}),
  };

  static Item = ListTabularItem;
  static Column = ListColumn;
  static Selection = ListSelection;
  static DataSource = ListDataSource;

  constructor(props) {
    super(props);
    if (!props.itemHeight) {
      throw new Error(
        'ListTabular: You must provide an itemHeight - raising to avoid divide by zero errors.',
      );
    }

    this._unlisten = () => {
    };
    this.state = this.buildStateForRange({ start: -1, end: -1 });
    this._scrollTimer = null;
  }

  componentDidMount() {
    window.addEventListener('resize', this.onWindowResize, true);
    this.setupDataSource(this.props.dataSource);
    this.updateRangeState();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.dataSource !== this.props.dataSource) {
      this.setupDataSource(nextProps.dataSource);
    }
    if (nextProps.itemHeight !== this.props.itemHeight) {
      this.updateRangeState(nextProps);
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.onComponentDidUpdate) {
      this.props.onComponentDidUpdate();
    }
    // If our view has been swapped out for an entirely different one,
    // reset our scroll position to the top.
    if (prevProps.dataSource !== this.props.dataSource) {
      this._scrollRegion.scrollTop = 0;
    }

    if (!this.updateRangeStateFiring) {
      this.updateRangeState();
    }
    this.updateRangeStateFiring = false;

    if (!this._cleanupAnimationTimeout) {
      this._cleanupAnimationTimeout = window.setTimeout(this.onCleanupAnimatingItems, 50);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onWindowResize, true);
    if (this._cleanupAnimationTimeout) {
      window.clearTimeout(this._cleanupAnimationTimeout);
    }
    if (this._scrollTimer) {
      window.clearTimeout(this._scrollTimer);
    }
    this._unlisten();
  }

  onWindowResize = () => {
    if (this._onWindowResize == null) {
      this._onWindowResize = _.debounce(this.updateRangeState, 50);
    }
    this._onWindowResize();
  };

  onScroll = (e) => {
    // If we've shifted enough pixels from our previous scrollTop to require
    // new rows to be rendered, update our state!
    this.updateRangeState();
    if (this.props.onScroll) {
      this.props.onScroll(e);
    }
  };

  onCleanupAnimatingItems = () => {
    this._cleanupAnimationTimeout = null;

    const nextAnimatingOut = {};
    Object.entries(this.state.animatingOut).forEach(([idx, record]) => {
      if (Date.now() < record.end) {
        nextAnimatingOut[idx] = record;
      }
    });

    if (Object.keys(nextAnimatingOut).length < Object.keys(this.state.animatingOut).length) {
      this.setState({ animatingOut: nextAnimatingOut });
    }

    if (Object.keys(nextAnimatingOut).length > 0) {
      this._cleanupAnimationTimeout = window.setTimeout(this.onCleanupAnimatingItems, 50);
    }
  };

  setupDataSource(dataSource) {
    this._unlisten();
    this._unlisten = dataSource.listen(() => {
      this.setState(this.buildStateForRange());
    });
    this.setState(this.buildStateForRange({ start: -1, end: -1, dataSource }));
  }

  getRowsToRender() {
    const { itemPropsProvider } = this.props;
    const { items, animatingOut, renderedRangeStart, renderedRangeEnd } = this.state;
    // The ordering of the rows array is important. We want current rows to
    // slide over rows which are animating out, so we need to render them last.
    const rows = [];
    Object.entries(animatingOut).forEach(([idx, record]) => {
      const itemProps = itemPropsProvider(record.item, idx / 1);
      rows.push({ item: record.item, idx: idx / 1, itemProps });
    });
    Utils.range(renderedRangeStart, renderedRangeEnd).forEach(idx => {
      const item = items[idx];
      if (item) {
        const itemProps = itemPropsProvider(item, idx);
        rows.push({ item, idx, itemProps });
      }
    });

    return rows;
  }

  scrollTo(node) {
    if (!this._scrollRegion) {
      return;
    }
    this._scrollRegion.scrollTo(node);
  }

  scrollByPage(direction) {
    if (!this._scrollRegion) {
      return;
    }
    const height = ReactDOM.findDOMNode(this._scrollRegion).clientHeight;
    this._scrollRegion.scrollTop += height * direction;
  }

  updateRangeState(nextProps) {
    if (!this._scrollRegion) {
      return;
    }
    const { scrollTop } = this._scrollRegion;
    const { itemHeight } = nextProps || this.props;

    // Determine the exact range of rows we want onscreen
    const rangeSize = Math.ceil(window.innerHeight / itemHeight);
    let rangeStart = Math.floor(scrollTop / itemHeight);
    let rangeEnd = rangeStart + rangeSize;

    // Expand the start/end so that you can advance the keyboard cursor fast and
    // we have items to move to and then scroll to.
    rangeStart = Math.max(0, rangeStart - 2);
    rangeEnd = Math.min(rangeEnd + 2, this.state.count + 1);

    // Final sanity check to prevent needless work
    const shouldNotUpdate =
      rangeEnd === this.state.renderedRangeEnd && rangeStart === this.state.renderedRangeStart;
    if (shouldNotUpdate) {
      return;
    }

    this.updateRangeStateFiring = true;

    this.props.dataSource.setRetainedRange({
      start: rangeStart,
      end: rangeEnd,
    });

    const nextState = this.buildStateForRange({ start: rangeStart, end: rangeEnd });
    this.setState(nextState);
  }

  buildStateForRange(args = {}) {
    const {
      start = this.state.renderedRangeStart,
      end = this.state.renderedRangeEnd,
      dataSource = this.props.dataSource,
    } = args;

    const items = {};
    let animatingOut = {};
    Utils.range(start, end).forEach(idx => {
      items[idx] = dataSource.get(idx);
    });

    // If we have a previous state, and the previous range matches the new range,
    // (eg: we're not scrolling), identify removed items. We'll render them in one
    // last time but not allocate height to them. This allows us to animate them
    // being covered by other items, not just disappearing when others start to slide up.
    if (this.state && start === this.state.renderedRangeStart) {
      const nextIds = Object.values(items).map(a => a && a.id);
      animatingOut = {};

      // Keep items which are still animating out and are still not in the set
      Object.entries(this.state.animatingOut).forEach(([recordIdx, record]) => {
        if (Date.now() < record.end && !nextIds.includes(record.item.id)) {
          animatingOut[recordIdx] = record;
        }
      });

      // Add items which are no longer found in the set
      Object.entries(this.state.items).forEach(([previousIdx, previousItem]) => {
        if (!previousItem || nextIds.includes(previousItem.id)) {
          return;
        }
        animatingOut[previousIdx] = {
          idx: previousIdx,
          item: previousItem,
          end: Date.now() + 125,
        };
      });

      // If we think /all/ the items are animating out, or a lot of them,
      // the user probably switched to an entirely different perspective.
      // Don't bother trying to animate.
      const animatingCount = Object.keys(animatingOut).length;
      if (animatingCount > 8 || animatingCount === Object.keys(this.state.items).length) {
        animatingOut = {};
      }
    }else{
      this.sendObservableRangeTask(dataSource, items);
    }
    return {
      items,
      animatingOut,
      renderedRangeStart: start,
      renderedRangeEnd: end,
      count: dataSource.count(),
      loaded: dataSource.loaded(),
      empty: dataSource.empty(),
    };
  }
  sendObservableRangeTask = (dataSource, items) => {
    // Sometimes setObservableRangeTask is undefined(I'm not sure why),
    // so we check to make sure it is defined
    if (dataSource.setObservableRangeTask) {
      if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
      }
      this._scrollTimer = setTimeout(() => {
        dataSource.setObservableRangeTask({ items });
      }, 700);
    }
  };

  render() {
    const {
      footer,
      columns,
      className,
      draggable,
      itemHeight,
      EmptyComponent,
      scrollTooltipComponent,
      onClick,
      onSelect,
      onDragEnd,
      onDragStart,
      onDoubleClick,
      dataSource
    } = this.props;
    const { count, loaded, empty } = this.state;
    const rows = this.getRowsToRender();
    const innerStyles = { height: count * itemHeight };
    // const headerHeight = -40;
    let offsetHeight = 0;
    // let isHeaderShow = true;
    // if (isHeaderShow) {
    //   offsetHeight = headerHeight;
    // }
    const current = FocusedPerspectiveStore.current();
    let Toolbar;
    if (current.drafts) {
      Toolbar = ComponentRegistry.findComponentsMatching({ role: 'DraftListToolbar' })[0];
    } else {
      Toolbar = ComponentRegistry.findComponentsMatching({ role: 'ThreadListToolbar' })[0];
    }
    let hasEmptyBar = ''
    if (current && ['spam', 'trash'].includes(current.categoriesSharedRole())) {
      hasEmptyBar = 'has-empty-bar';
    }
    return (
      <div className={`list-container list-tabular ${className} ${hasEmptyBar}`}>
        {Toolbar ? <Toolbar /> : null}
        <ScrollRegion
          ref={cm => {
            this._scrollRegion = cm;
          }}
          onScroll={this.onScroll}
          tabIndex="-1"
          scrollTooltipComponent={scrollTooltipComponent}
        >
          <ListTabularRows
            rows={rows}
            columns={columns}
            draggable={draggable}
            itemHeight={itemHeight}
            innerStyles={innerStyles}
            offsetHeight={offsetHeight}
            onClick={onClick}
            onSelect={onSelect}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onDoubleClick={onDoubleClick}
          />
          {/* when display EmptyComponent, do not display footer */}
          <div className="footer">{!(loaded && empty) ? footer : null}</div>
        </ScrollRegion>
        <Spinner visible={!loaded && empty} />
        <EmptyComponent visible={loaded && empty} />
      </div>
    );
  }
}

export default ListTabular;
