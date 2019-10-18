import {
  Utils,
  WorkspaceStore,
  ThreadCountsStore,
  CategoryStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { InjectedComponentSet, RetinaImg } from 'mailspring-component-kit';
import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import moment from 'moment';
import classnames from 'classnames';
import { remote } from 'electron';

const { Menu, MenuItem } = remote;
const stopRefreshingDelay = 30000;

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
    dataSource: PropTypes.object,
    renderFilterSelection: PropTypes.bool,
    renderRefresh: PropTypes.bool,
    selectAllSelectionFilter: PropTypes.func,
  };
  static defaultProps = {
    renderFilterSelection: true,
    renderRefresh: true,
    selectAllSelectionFilter: null,
  };

  constructor(props) {
    super(props);
    this.state = {
      selectAll: true,
      refreshingMessages: false,
      previousPerspectiveName: '',
      previousUpdatedTime: '',
      cachedSyncFolderData: null,
      lastUpdatedTime: FocusedPerspectiveStore.getLastUpdatedTime(),
    };
    this.refreshTimer = null;
    this.refreshDelay = 300;
    this.stopRefreshingTimer = null;
    this.mounted = false;
    this._unlisten = null;
  }

  componentDidMount() {
    this.mounted = true;
    this._unlisten = [
      CategoryStore.listen(this._onCategoryChange),
      FocusedPerspectiveStore.listen(this._onCategoryChange),
    ];
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate = () => {
    const perspective = FocusedPerspectiveStore.current();
    const updatedTime = FocusedPerspectiveStore.getLastUpdatedTime();
    const state = {};
    if (this.state.previousPerspectiveName !== perspective.name) {
      state.previousPerspectiveName = perspective.name;
      state.previousUpdatedTime = updatedTime;
      state.refreshingMessages = false;
    } else if (this.state.previousUpdatedTime !== updatedTime) {
      state.previousUpdatedTime = updatedTime;
      state.refreshingMessages = false;
    }
    if (state.refreshingMessages === false) {
      this.stopRefreshing();
      delete state.refreshingMessages;
    }
    this.setState(state);
  };

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.stopRefreshingTimer);
    if(Array.isArray(this._unlisten)){
      this._unlisten.forEach(unlisten=>{
        unlisten();
      });
    }
  }
  _onCategoryChange = () => {
    if (this.mounted) {
      const lastUpdatedTime = FocusedPerspectiveStore.getLastUpdatedTime();
      if (lastUpdatedTime > this.state.lastUpdatedTime) {
        this.setState({ lastUpdatedTime });
      }
    }
  };

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
    const checkStatus = this.checkStatus();
    // select all
    if (!checkStatus) {
      this._selectAll();
    }
    // deselect all
    else {
      this._clearSelection();
    }
  };

  _renderLastUpdateLabel(lastUpdate) {
    if (!lastUpdate) {
      return null;
    }
    if (Date.now() - lastUpdate.getTime() < 2 * 60 * 1000) {
      return <span>Updated Just Now</span>;
    }
    return <span>Updated {moment(lastUpdate).fromNow()}</span>;
  }

  _formatNumber(num) {
    return num && num.toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
  }

  _selectAll = () => {
    const { dataSource } = this.props;
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    if (items) {
      if(this.props.selectAllSelectionFilter){
        const filteredItems = items.filter(this.props.selectAllSelectionFilter);
        dataSource.selection.set(filteredItems);
      }else{
        dataSource.selection.set(items);
      }
    }
  };

  _clearSelection = () => {
    this.props.onClearSelection();
  };

  onSelectWithFilter = () => {
    const menu = new Menu();
    menu.append(
      new MenuItem({
        label: `All`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('multiselect-list:select-all');
        },
      })
    );
    menu.append(
      new MenuItem({
        label: `None`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('multiselect-list:deselect-all');
        },
      })
    );
    menu.append(
      new MenuItem({
        label: `Unread`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-unread');
        },
      })
    );
    menu.append(
      new MenuItem({
        label: `Flagged`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-starred');
        },
      })
    );
    menu.append(
      new MenuItem({
        label: `Important`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-important');
        },
      })
    );
    menu.popup({});
  };

  checkStatus = () => {
    const { dataSource, selectionCount } = this.props;
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    const isSelectAll = items && items.length && selectionCount === items.length;
    if (isSelectAll) {
      return 'selected';
    } else if (selectionCount) {
      return 'some-selected';
    }
    return '';
  };
  stopRefreshing = () => {
    if (!this.stopRefreshingTimer) {
      clearTimeout(this.stopRefreshingTimer);
      this.stopRefreshingTimer = null;
    }
    if (!this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        if (this.mounted) {
          this.setState({ refreshingMessages: false, cachedSyncFolderData: null });
        }
        this.refreshTimer = null;
      }, this.refreshDelay);
    }
  };

  refreshPerspective = () => {
    if (!this.state.refreshingMessages) {
      const accounts = FocusedPerspectiveStore.refreshPerspectiveMessages();
      this.setState({ refreshingMessages: true, cachedSyncFolderData: accounts });
      this.stopRefreshingTimer = setTimeout(this.stopRefreshing, stopRefreshingDelay);
    }
  };

  renderRefreshButton(perspective) {
    if(!this.props.renderRefresh){
      return null;
    }
    if (!perspective) {
      return null;
    }
    if (perspective.starred) {
      return null;
    }
    if (this.state.refreshingMessages) {
      return (
        <div style={{ padding: '0 5px' }}>
          <RetinaImg
            name="refresh.svg"
            className="infinite-rotation-linear"
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </div>
      );
    }
    return (
      <button
        tabIndex={-1}
        style={{ cursor: 'pointer' }}
        className="btn btn-toolbar btn-list-more"
        title="Refresh"
        onClick={this.refreshPerspective}
      >
        <RetinaImg
          name="refresh.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }

  _switchSingleDomDisplay(selector, shouldShow, displayType) {
    const el = document.querySelector(selector);
    if (el) {
      el.style.display = shouldShow ? displayType : 'none';
    }
  }

  _switchQuickSidebar = shouldShow => {
    this._switchSingleDomDisplay('.column-QuickSidebar', shouldShow, 'flex');
    this._switchSingleDomDisplay('.column-MessageListSidebar', shouldShow, 'block');
    this._switchSingleDomDisplay('.toolbar-QuickSidebar', shouldShow, 'inherit');
    this._switchSingleDomDisplay('.toolbar-MessageListSidebar', shouldShow, 'inherit');
    this.recomputeLayout();
  };

  recomputeLayout() {
    // Find our item containers that are tied to specific columns
    const columnToolbarEls = document.querySelectorAll('.sheet-toolbar-container  [data-column]');

    // Find the top sheet in the stack
    const sheetList = document.querySelectorAll("[name='Sheet']") || [];
    const sheet = sheetList[sheetList.length - 1];
    if (!sheet) {
      return;
    }

    // Position item containers so they have the position and width
    // as their respective columns in the top sheet
    for (const columnToolbarEl of columnToolbarEls) {
      const column = columnToolbarEl.dataset.column;
      const columnEl = sheet.querySelector(`[data-column='${column}']`);
      if (!columnEl) {
        continue;
      }
      columnToolbarEl.style.left = `${columnEl.offsetLeft}px`;
      columnToolbarEl.style.width = `${columnEl.offsetWidth}px`;
    }
  }
  renderFilterSelection(){
    if(this.props.renderFilterSelection){
      return <div onClick={this.onSelectWithFilter} title="Select" className="btn btn-toolbar btn-selection-filter">
        <RetinaImg
          name="arrow-dropdown.svg"
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 20 }}
        />
      </div>;
    }
    return null;
  }

  renderToolbar() {
    const { toolbarElement, dataSource, selectionCount, onEmptyButtons } = this.props;
    let totalCount = 0;
    if (dataSource) {
      totalCount = dataSource.count();
    } else {
      this._switchQuickSidebar(false);
      return <span />;
    }
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    const checkStatus = this.checkStatus();
    const current = FocusedPerspectiveStore.current();
    let threadCounts = 0;
    const lastUpdate = FocusedPerspectiveStore.getLastUpdatedTime();
    if (current && current._categories && current._categories.length) {
      // 'Unread' is not a folder, don't display count
      if (current.name !== 'Unread' && current._categories && current._categories.length > 0) {
        for (let cat of current._categories) {
          threadCounts += ThreadCountsStore.totalCountForCategoryId(cat.id);
        }
      } else if (current.name === 'Unread') {
        for (let cat of current._categories) {
          threadCounts += ThreadCountsStore.unreadCountForCategoryId(cat.id);
        }
      }
    }

    if (threadCounts > 0) {
      this._switchQuickSidebar(true);
    } else {
      this._switchQuickSidebar(false);
    }
    const classes = classnames({
      'multiselect-toolbar-root': true,
      'no-threads': items.length === 0,
      'thread-list-toolbar': true,
    });
    return (
      <div className={classes} key="absolute">
        <div className="inner">
          <div className={'checkmark ' + checkStatus} onClick={this.onToggleSelectAll}></div>
          {this.renderFilterSelection()}
          {selectionCount > 0 ? (
            <div style={{ display: 'flex', flex: '1', marginRight: 10 }}>
              <div className="selection-label">{this.selectionLabel()}</div>
              {/* <button className="btn clickable btn-toggle-select-all" onClick={this._selectAll}>
                  Select all {this._formatNumber(totalCount)}
                </button>
                <button className="btn clickable btn-clear-all" onClick={this._clearSelection}>
                  Clear Selection
                </button> */}
              {WorkspaceStore.layoutMode() === 'list' ? (
                <div className="divider" key="thread-list-tool-bar-divider" />
              ) : null}
              {toolbarElement}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                width: 'calc(100% - 66px)',
                justifyContent: 'space-between',
                marginRight: 10,
              }}
            >
              {this.state.refreshingMessages ? (
                <span className="updated-time">Checking for mail...</span>
              ) : (
                <span className="updated-time">
                  {this._renderLastUpdateLabel(this.state.lastUpdatedTime)}
                  {threadCounts > 0 && (
                    <span className="toolbar-unread-count">
                      ({this._formatNumber(threadCounts)})
                    </span>
                  )}
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {this.renderRefreshButton(current)}
                {onEmptyButtons}
              </div>
            </div>
          )}
        </div>
        <InjectedComponentSet
          matching={{ role: 'ThreadListEmptyFolderBar' }}
          className="empty-folder-bar"
        />
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
