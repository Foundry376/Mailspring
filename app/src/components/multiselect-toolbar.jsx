import {
  Utils,
  WorkspaceStore,
  ThreadCountsStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { InjectedComponentSet, RetinaImg, LottieImg } from 'mailspring-component-kit';
import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import moment from 'moment';
import classnames from 'classnames';
import { remote } from 'electron';

const { Menu, MenuItem } = remote;

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
  };

  constructor(props) {
    super(props);
    this.state = {
      selectAll: true,
      refreshingMessages: false,
      previousPerspectiveName: '',
      previousUpdatedTime: '',
    };
    this.refreshTimer = null;
    this.refreshDelay = 300;
    this.mounted = false;
  }

  componentDidMount() {
    this.mounted = true;
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
      state.refreshingMessages = false;
    }
    if (this.state.previousUpdatedTime !== updatedTime) {
      state.previousUpdatedTime = updatedTime;
      state.refreshingMessages = false;
    }
    if (state.refreshingMessages === false) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.setState(state);
  };

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.refreshTimer);
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
    return (
      <span>Updated {moment(lastUpdate).fromNow()}</span>
    );
  }

  _formatNumber(num) {
    return num && num.toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
  }

  _selectAll = () => {
    const { dataSource } = this.props;
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    if (items) {
      dataSource.selection.set(items);
    }
  };

  _clearSelection = () => {
    this.props.onClearSelection();
  };

  onSelectWithFilter = () => {
    const menu = new Menu();
    menu.append(new MenuItem({
        label: `All`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('multiselect-list:select-all');
        },
      }),
    );
    menu.append(new MenuItem({
        label: `None`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('multiselect-list:deselect-all');
        },
      }),
    );
    menu.append(new MenuItem({
        label: `Unread`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-unread');
        },
      }),
    );
    menu.append(new MenuItem({
        label: `Flagged`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-starred');
        },
      }),
    );
    menu.append(new MenuItem({
        label: `Important`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('thread-list:select-important');
        },
      }),
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
  refreshPerspective = () => {
    if (!this.state.refreshingMessages && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        if (this.mounted) {
          FocusedPerspectiveStore.refreshPerspectiveMessages();
          this.setState({ refreshingMessages: true });
        }
        this.refreshTimer = null;
      }, this.refreshDelay);
    }
  };

  renderRefreshButton(perspective) {
    if (!perspective) {
      return null;
    }
    if (perspective.starred) {
      return null;
    }
    if (this.state.refreshingMessages) {
      return <LottieImg name='loading-spinner-blue'
                        size={{ width: 24, height: 24 }}
                        style={{ margin: '0 5px' }}/>;
    }
    return <button tabIndex={-1}
                   className="btn btn-toolbar btn-list-more" title='Refresh'
                   onClick={this.refreshPerspective}>
      <RetinaImg name='refresh.svg'
                 style={{ width: 24, height: 24 }} isIcon
                 mode={RetinaImg.Mode.ContentIsMask}/>
    </button>;
  }

  renderToolbar() {
    const { toolbarElement, dataSource, selectionCount, onEmptyButtons } = this.props;
    let totalCount = 0;
    if (dataSource) {
      totalCount = dataSource.count();
    } else {
      return <span/>;
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
    const classes = classnames({
      'multiselect-toolbar-root': true,
      'no-threads': items.length === 0,
    });
    return (
      <div className={classes} key="absolute">
        <div className="inner">
          <div className={'checkmark ' + checkStatus} onClick={this.onToggleSelectAll}></div>
          <div onClick={this.onSelectWithFilter} className="btn btn-toolbar btn-selection-filter">
            <RetinaImg
              name="arrow-dropdown.svg"
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
              style={{ width: 20 }}
            />
          </div>
          {
            selectionCount > 0 ? (
              <div style={{ display: 'flex', flex: '1', marginRight: 10 }}>
                <div className="selection-label">{this.selectionLabel()}</div>
                {/* <button className="btn clickable btn-toggle-select-all" onClick={this._selectAll}>
                  Select all {this._formatNumber(totalCount)}
                </button>
                <button className="btn clickable btn-clear-all" onClick={this._clearSelection}>
                  Clear Selection
                </button> */}
                {WorkspaceStore.layoutMode() === 'list' ?
                  <div className="divider" key='thread-list-tool-bar-divider'/> : null}
                {toolbarElement}
              </div>
            ) : (
              <div style={{
                display: 'flex', width: 'calc(100% - 66px)',
                justifyContent: 'space-between',
                marginRight: 10,
              }}>
                {this.state.refreshingMessages ?
                  <span className="updated-time">Checking for mail...</span>
                  : <span className="updated-time">
                    {this._renderLastUpdateLabel(lastUpdate)}
                    {threadCounts > 0 && (
                      <span className="toolbar-unread-count">({this._formatNumber(threadCounts)})</span>
                    )}
                  </span>
                }
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {this.renderRefreshButton(current)}
                  {onEmptyButtons}
                </div>
              </div>
            )
          }
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
