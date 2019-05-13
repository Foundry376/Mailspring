import { Utils, WorkspaceStore, ThreadCountsStore, FocusedPerspectiveStore, CategoryStore, Label } from 'mailspring-exports';
import { InjectedComponentSet, RetinaImg } from 'mailspring-component-kit';
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

  componentDidUpdate = () => {

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

  _selectAll = () => {
    const { dataSource } = this.props;
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    if (items) {
      dataSource.selection.set(items);
    }
  }

  _clearSelection = () => {
    this.props.onClearSelection();
  }

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
  }

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
  }

  renderToolbar() {
    const { toolbarElement, dataSource, selectionCount, onEmptyButtons } = this.props;
    let totalCount = 0;
    if (dataSource) {
      totalCount = dataSource.count();
    } else {
      return <span />
    }
    const items = dataSource.itemsCurrentlyInViewMatching(() => true);
    const checkStatus = this.checkStatus();
    const current = FocusedPerspectiveStore.current();
    let threadCounts = 0;
    let lastUpdate = 0;
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
      let category = CategoryStore.byId(current._categories[0].accountId, current._categories[0].id);
      if (category instanceof Label) {
        category = CategoryStore.getCategoryByRole(current._categories[0].accountId, 'all');
      }
      lastUpdate = category ? category.updatedAt : '';
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
                      <span className="toolbar-unread-count">({this._formatNumber(threadCounts)})</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
