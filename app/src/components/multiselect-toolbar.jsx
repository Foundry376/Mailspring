import { Utils, WorkspaceStore } from 'mailspring-exports';
import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';

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

  selectAll = () => {
    const { onClearSelection, dataSource } = this.props;
    const items = this.props.dataSource.itemsCurrentlyInViewMatching(() => true);
    if (items) {
      dataSource.selection.set(items);
    }
    this.setState({
      selectAll: false
    })
  }

  renderToolbar() {
    const { toolbarElement, onClearSelection, dataSource } = this.props;
    const mode = WorkspaceStore.layoutMode();
    let totalCount = 0;
    if (dataSource) {
      totalCount = dataSource.count();
    }
    return (
      <div className="absolute" key="absolute">
        <div className="inner">
          <div className={'checkmark' + (!this.state.selectAll ? ' selected' : '')} onClick={this.onToggleSelectAll}></div>
          <div className="selection-label">{this.selectionLabel()}</div>
          <button className="btn btn-toggle-select-all" onClick={this.selectAll}>
            Select all {totalCount} messages
          </button>
          <button className="btn btn-clear-all" onClick={onClearSelection}>
            Clear Selection
          </button>
          {mode === 'list' ? toolbarElement : null}
        </div>
      </div>
    );
  }

  render() {
    const { selectionCount } = this.props;
    return (
      <CSSTransitionGroup
        className={'selection-bar'}
        transitionName="selection-bar-absolute"
        component="div"
        transitionLeaveTimeout={200}
        transitionEnterTimeout={200}
      >
        {selectionCount > 0 ? this.renderToolbar() : undefined}
      </CSSTransitionGroup>
    );
  }
}

export default MultiselectToolbar;
