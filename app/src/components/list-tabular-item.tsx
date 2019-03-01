import SwipeContainer from './swipe-container';
import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';
import { ListTabularColumn } from './list-tabular';

type ListTabularItemProps = {
  metrics?: {
    top: number;
    height: number;
  };
  columns: ListTabularColumn[];
  item: object;
  itemProps?: {
    className?: string;
  };
  onSelect?: (...args: any[]) => any;
  onClick?: (...args: any[]) => any;
  onDoubleClick?: (...args: any[]) => any;
};

export default class ListTabularItem extends React.Component<ListTabularItemProps> {
  static displayName = 'ListTabularItem';
  static propTypes = {
    metrics: PropTypes.object,
    columns: PropTypes.arrayOf(PropTypes.object).isRequired,
    item: PropTypes.object.isRequired,
    itemProps: PropTypes.object,
    onSelect: PropTypes.func,
    onClick: PropTypes.func,
    onDoubleClick: PropTypes.func,
  };

  _columnCache: JSX.Element[] | null = null;
  _lastClickTime: number;

  // DO NOT DELETE unless you know what you're doing! This method cuts
  // React.Perf.wasted-time from ~300msec to 20msec by doing a deep
  // comparison of props before triggering a re-render.
  shouldComponentUpdate(nextProps, nextState) {
    if (
      !Utils.isEqualReact(this.props.item, nextProps.item) ||
      this.props.columns !== nextProps.columns
    ) {
      this._columnCache = null;
      return true;
    }
    if (
      !Utils.isEqualReact(Utils.fastOmit(this.props, ['item']), Utils.fastOmit(nextProps, ['item']))
    ) {
      return true;
    }
    return false;
  }

  render() {
    const itemProps = this.props.itemProps || {};
    const className = `list-item list-tabular-item ${itemProps.className}`;
    const props = Utils.fastOmit(itemProps, ['className']);

    // It's expensive to compute the contents of columns (format timestamps, etc.)
    // We only do it if the item prop has changed.
    if (this._columnCache == null) {
      this._columnCache = this._columns();
    }

    return (
      <SwipeContainer
        {...props}
        onClick={this._onClick}
        style={{
          position: 'absolute',
          top: this.props.metrics.top,
          width: '100%',
          height: this.props.metrics.height,
        }}
      >
        <div className={className} style={{ height: this.props.metrics.height }}>
          {this._columnCache}
        </div>
      </SwipeContainer>
    );
  }

  _columns = () => {
    const names = {};
    return (this.props.columns || []).map(column => {
      if (names[column.name]) {
        console.warn(
          `ListTabular: Columns do not have distinct names, will cause React error! \`${
            column.name
          }\` twice.`
        );
      }
      names[column.name] = true;

      return (
        <div
          key={column.name}
          style={{ flex: column.flex, width: column.width }}
          className={`list-column list-column-${column.name}`}
        >
          {column.resolver(this.props.item, this)}
        </div>
      );
    });
  };

  _onClick = event => {
    if (typeof this.props.onSelect === 'function') {
      this.props.onSelect(this.props.item, event);
    }

    if (typeof this.props.onClick === 'function') {
      this.props.onClick(this.props.item, event);
    }
    if (this._lastClickTime != null && Date.now() - this._lastClickTime < 350) {
      if (typeof this.props.onDoubleClick === 'function') {
        this.props.onDoubleClick(this.props.item, event);
      }
    }

    this._lastClickTime = Date.now();
  };
}
