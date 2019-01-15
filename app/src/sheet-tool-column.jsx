/* eslint react/prefer-stateless-function: 0 */
/* eslint global-require: 0 */
import React from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { remote } from 'electron';
import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import Flexbox from './components/flexbox';
import Utils from './flux/models/utils';
import { WindowTitle } from './sheet-toolbar';

class ToolbarSpacer extends React.Component {
  static displayName = 'ToolbarSpacer';
  static propTypes = {
    order: PropTypes.number,
  };

  render() {
    return <div className="item-spacer" style={{ flex: 1, order: this.props.order || 0 }} />;
  }
}

export default class ToolColumn extends React.Component {
  static displayName = 'ToolColumn';

  static propTypes = {
    data: PropTypes.object,
    depth: PropTypes.number,
  };

  static childContextTypes = {
    sheetDepth: PropTypes.number,
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  getChildContext() {
    return {
      sheetDepth: this.props.depth,
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.unlisteners = [];
    this.unlisteners.push(WorkspaceStore.listen(() => this.setState(this._getStateFromStores())));
    this.unlisteners.push(
      ComponentRegistry.listen(() => this.setState(this._getStateFromStores()))
    );
    window.addEventListener('resize', this._onWindowResize);
    window.requestAnimationFrame(() => this.recomputeLayout());
  }

  componentWillReceiveProps(props) {
    this.setState(this._getStateFromStores(props));
  }

  shouldComponentUpdate(nextProps, nextState) {
    // This is very important. Because toolbar uses CSSTransitionGroup,
    // repetitive unnecessary updates can break animations and cause performance issues.
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    // Wait for other components that are dirty (the actual columns in the sheet)
    window.requestAnimationFrame(() => this.recomputeLayout());
  }

  componentWillUnmount() {
    this.mounted = false;
    window.removeEventListener('resize', this._onWindowResize);
    for (const u of this.unlisteners) {
      u();
    }
  }

  recomputeLayout() {
    // Yes this really happens - do not remove!
    if (!this.mounted) {
      return;
    }

    // Find our item containers that are tied to specific columns
    const el = ReactDOM.findDOMNode(this);
    const columnToolbarEls = el.querySelectorAll('[data-column]');

    // Find the top sheet in the stack
    const sheet = document.querySelectorAll("[name='Sheet']")[this.props.depth];
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

      columnToolbarEl.style.display = 'inherit';
      columnToolbarEl.style.left = `${columnEl.offsetLeft}px`;
      columnToolbarEl.style.width = `${columnEl.offsetWidth}px`;
    }

    // Record our overall height for sheets
    remote.getCurrentWindow().setSheetOffset(el.clientHeight);
  }

  _onWindowResize = () => {
    this.recomputeLayout();
  };

  _getStateFromStores(props = this.props) {
    const state = {
      mode: WorkspaceStore.layoutMode(),
      components: [],
      columnName: '',
    };

    const loc = this.props.loc,
      idx = this.props.idx,
      maxColumn = this.props.maxColumn;

    // Add items registered to Regions in the current sheet
    // if (props.data && props.data.columns[state.mode] && !WorkspaceStore.isLocationHidden(loc)) {
    if (idx > 0) {
      const entries = ComponentRegistry.findComponentsMatching({
        location: loc.Toolbar,
        mode: state.mode,
      });
      state.components.push(...entries);
      if (entries) {
        state.columnName = loc.Toolbar.id.split(':')[0];
      }
    }

    // Add left items registered to the Sheet instead of to a Region
    if (idx === 0) {
      for (const loc of [WorkspaceStore.Sheet.Global, props.data]) {
        const entries = ComponentRegistry.findComponentsMatching({
          location: loc.Toolbar.Left,
          mode: state.mode,
        });
        state.components.push(...entries);
      }
    }
    //Removed because we moved back button to messageList
    // if (props.depth > 0) {
    //   state.columns[0].push(ToolbarBack);
    // }

    // Add right items registered to the Sheet instead of to a Region
    if (idx === maxColumn) {
      for (const loc of [WorkspaceStore.Sheet.Global, props.data]) {
        const entries = ComponentRegistry.findComponentsMatching({
          location: loc.Toolbar.Right,
          mode: state.mode,
        });
        state.components.push(...entries);
      }
    }
    if (state.mode === 'popout' && idx === 0) {
      state.components.push(WindowTitle);
    }

    return state;
  }

  _flexboxForComponents(components) {
    const elements = components.map(Component => (
      <Component key={Component.displayName} {...this.props} />
    ));
    return (
      <Flexbox className="item-container" direction="row">
        {elements}
        <ToolbarSpacer key="spacer-50" order={-50} />
        <ToolbarSpacer key="spacer+50" order={50} />
      </Flexbox>
    );
  }

  render() {

    const components = this.state.components,
      idx = this.props.idx,
      loc = this.props.loc;
    let width = '100%',
      zIndex = 1,
      borderBottom = '';
    if (loc.id === 'ThreadList') {
      width = '200%';
      zIndex = 999;
      borderBottom = 'solid gray 1px';
    }
    const style = {
      position: 'relative',
      width,
      zIndex,
      borderBottom,
      height: '32px',
    };

    const toolbar = (
      <div
        style={style}
        className={`toolbar-${this.state.columnName}`}
        data-column={idx}
        key={idx}
      >
        {this._flexboxForComponents(components)}
      </div>
    );
  return toolbar;

  }
}
