import { Utils, WorkspaceStore, ThreadCountsStore, FocusedPerspectiveStore, CategoryStore, Label } from 'mailspring-exports';
import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import moment from 'moment';

/*
 * MultiselectToolbar renders a toolbar inside a horizontal bar and displays
 * a selection count and a button to clear the selection.
 *
 * The toolbar, or set of buttons, must be passed in as props.toolbarElement
 *
 * It will also animate its mounting and unmounting
 * @class MultiselectToolbar
 */
class MultiselectToolbar extends Component {
  static displayName = 'MultiselectToolbar';

  static propTypes = {
    toolbarElement: PropTypes.element.isRequired,
    onEmptyButtons: PropTypes.element,
    collection: PropTypes.string.isRequired,
    onClearSelection: PropTypes.func.isRequired,
    selectionCount: PropTypes.node,
    dataSource: PropTypes.object
  };

  constructor() {
    super();
    this.state = {
      selectAll: true
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  selectionLabel = () => {
    const { selectionCount, collection } = this.props;
    if (selectionCount > 1) {
      return `${selectionCount} ${collection}s selected`;
    } else if (selectionCount === 1) {
      return `${selectionCount} ${collection} selected`;
    }
    return '';
  };

  onToggleSelectAll = () => {
    const { onClearSelection } = this.props;
    // select all
    if (this.state.selectAll) {
      this.selectAll();
    }
    // deselect all
    else {
      onClearSelection();
      this.setState({
        selectAll: true
      })
    }
  }

  _renderLastUpdateLabel(lastUpdate) {
    if (!lastUpdate) {
      return null;
    }
    if (Date.now() - lastUpdate.getTime() < 2 * 60 * 1000) {
      return <span>Updated Just Now</span>;
    }
    return (
      <span>Updated {moment(lastUpdate).fromNow()}</span>
    )
  }

  _formatNumber(num) {
    return num && num.toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
  }

  selectAll = () => {
    const { onClearSelection, dataSource } = this.props;
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    if (items) {
      dataSource.selection.set(items);
    }
    this.setState({
      selectAll: false
    })
  }

  _clearSelection = () => {
    this.props.onClearSelection();
    this.setState({
      selectAll: true
    })
  }

  renderToolbar() {
    const { toolbarElement, dataSource, selectionCount, onEmptyButtons } = this.props;
    const mode = WorkspaceStore.layoutMode();
    let totalCount = 0;
    if (dataSource) {
      totalCount = dataSource.count();
    } else {
      return <span />
    }
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    const isSelectAll = !this.state.selectAll && items && items.length && selectionCount === items.length;
    const current = FocusedPerspectiveStore.current();
    let threadCounts = 0;
    let lastUpdate = 0;
    if (current && current._categories && current._categories.length) {
      // 'Unread' is not a folder, don't display count
      if (current.name !== 'Unread') {
        threadCounts = ThreadCountsStore.totalCountForCategoryId(current._categories[0].id);
      }
      let category = CategoryStore.byId(current._categories[0].accountId, current._categories[0].id);
      if (category instanceof Label) {
        category = CategoryStore.getCategoryByRole(current._categories[0].accountId, 'all');
      }
      lastUpdate = category ? category.updatedAt : '';
    }
    return (
      <div className="multiselect-toolbar-root" key="absolute">
        <div className="inner">
          <div className={'checkmark' + (isSelectAll ? ' selected' : '')} onClick={this.onToggleSelectAll}></div>
          {
            selectionCount > 0 ? (
              <div style={{ display: 'flex', flex: '1', marginRight: 10 }}>
                <div className="selection-label">{this.selectionLabel()}</div>
                <button className="btn btn-toggle-select-all" onClick={this.selectAll}>
                  Select all {this._formatNumber(totalCount)}
                </button>
                <button className="btn btn-clear-all" onClick={this._clearSelection}>
                  Clear Selection
                </button>
                {WorkspaceStore.layoutMode() === 'list' ? <div className="divider" key='thread-list-tool-bar-divider' /> : null}
                {toolbarElement}
              </div>
            ) : (
                <div style={{
                  display: 'flex', width: 'calc(100% - 66px)',
                  justifyContent: 'space-between',
                  marginRight: 10
                }}>
                  <span className="updated-time">
                    {this._renderLastUpdateLabel(lastUpdate)}
                    {threadCounts > 0 && (
                      <span>({this._formatNumber(threadCounts)})</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {onEmptyButtons}
                  </div>
                </div>
              )
          }
        </div>
      </div>
    );
  }

  render() {
    return (
      <CSSTransitionGroup
        className={'selection-bar'}
        transitionName="selection-bar-absolute"
        component="div"
        transitionLeaveTimeout={200}
        transitionEnterTimeout={200}
      >
        {/* {selectionCount > 0 ? this.renderToolbar() : undefined} */}
        {this.renderToolbar()}
      </CSSTransitionGroup>
    );
  }
}

export default MultiselectToolbar;
