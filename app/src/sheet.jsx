import React from 'react';
import PropTypes from 'prop-types';

import { Utils, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import InjectedComponentSet from './components/injected-component-set';
import ResizableRegion from './components/resizable-region';
import Flexbox from './components/flexbox';
import Toolbar from './sheet-toolbar';
import VerticalToolbar from './vertical-toolbar';
import LeftToolbar from './left-toolbar';
import ToolColumn from './sheet-tool-column';

const FLEX = 10000;

export default class Sheet extends React.Component {
  static displayName = 'Sheet';

  static propTypes = {
    data: PropTypes.object.isRequired,
    depth: PropTypes.number.isRequired,
    onColumnSizeChanged: PropTypes.func,
  };

  static defaultProps = {
    onColumnSizeChanged: () => {},
  };

  static childContextTypes = {
    sheetDepth: PropTypes.number,
  };

  constructor(props) {
    super(props);
    this.unlisteners = [];
    this.state = this._getStateFromStores();
  }

  getChildContext() {
    return {
      sheetDepth: this.props.depth,
    };
  }

  componentDidMount() {
    this.unlisteners.push(
      ComponentRegistry.listen(() => this.setState(this._getStateFromStores()))
    );
    this.unlisteners.push(WorkspaceStore.listen(() => this.setState(this._getStateFromStores())));
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    this.props.onColumnSizeChanged(this);
    const minWidth = this.state.columns.reduce((sum, col) => sum + col.minWidth, 0);
    AppEnv.setMinimumWidth(minWidth);
  }

  componentWillUnmount() {
    for (const u of this.unlisteners) {
      u();
    }
    this.unlisteners = [];
  }

  _columnFlexboxElements() {
    let sheet = this.props.data;
    return this.state.columns.map((column, idx) => {
      const { maxWidth, minWidth, handle, location, width } = column;
      let top = '0px';

      if (location.id === 'MessageList') {
        top = '32px';
      }

      const style = {
        position: 'relative',
        height: '100%',
        top: top,
        minWidth: minWidth,
      };

      if (maxWidth < FLEX) {
        style.width = maxWidth;
      } else {
        style.flex = 1;
      }
      const contentStyle = {
        flexDirection: 'column',
        position: 'relative',
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }

      // if (minWidth !== maxWidth && maxWidth < FLEX) {
      if (1) {
        return (
          <ResizableRegion
            key={`${this.props.data.id}:${idx}`}
            name={`${this.props.data.id}:${idx}`}
            className={`column-${location.id}`}
            style={style}
            data-column={idx}
            onResize={w => this._onColumnResize(column, w)}
            initialWidth={width}
            minWidth={minWidth}
            maxWidth={maxWidth}
            handle={handle}
          >
            <ToolColumn
              data={sheet}
              loc = {location}
              idx = {idx}
              maxColumn={this.state.columns.length - 1}
              key={`${sheet.id}:toolbar`}
            />
            { idx === 0 ?
              <LeftToolbar loc={location}></LeftToolbar> :
              null
            }
            <InjectedComponentSet
              direction="column"
              matching={{ location: location, mode: this.state.mode }}
              style={contentStyle}
            />
            {location.id === 'MessageList' ?
              <VerticalToolbar></VerticalToolbar>:
              null
            }
          </ResizableRegion>
        );
      } else {
        return (
          <InjectedComponentSet
            direction="column"
            key={`${this.props.data.id}:${idx}`}
            name={`${this.props.data.id}:${idx}`}
            className={`column-${location.id}`}
            data-column={idx}
            style={style}
            matching={{ location: location, mode: this.state.mode }}
          />
        );
      }
    });
  }

  _onColumnResize = (column, width) => {
    AppEnv.storeColumnWidth({ id: column.location.id, width: width });
    this.props.onColumnSizeChanged(this);
  };

  _getStateFromStores() {
    const state = {
      mode: WorkspaceStore.layoutMode(),
      columns: [],
    };

    let widest = -1;
    let widestWidth = -1;

    const data = this.props.data || {};

    if (data.columns[state.mode]) {
      data.columns[state.mode].forEach((location, idx) => {
        if (WorkspaceStore.isLocationHidden(location)) {
          return;
        }
        const entries = ComponentRegistry.findComponentsMatching({
          location: location,
          mode: state.mode,
        });

        const maxWidth = entries.reduce((m, { containerStyles }) => {
          if (
            containerStyles &&
            containerStyles.maxWidth !== undefined &&
            containerStyles.maxWidth < m
          ) {
            return containerStyles.maxWidth;
          }
          return m;
        }, 10000);

        const minWidth = entries.reduce((m, { containerStyles }) => {
          if (
            containerStyles &&
            containerStyles.minWidth !== undefined &&
            containerStyles.minWidth > m
          ) {
            return containerStyles.minWidth;
          }
          return m;
        }, 0);

        const width = AppEnv.getColumnWidth(location.id);
        const col = { maxWidth, minWidth, location, width };
        state.columns.push(col);

        if (maxWidth > widestWidth) {
          widestWidth = maxWidth;
          widest = idx;
        }
      });
    }

    if (state.columns.length > 0) {
      // Once we've accumulated all the React components for the columns,
      // ensure that at least one column has a huge max-width so that the columns
      // expand to fill the window. This may make items in the column unhappy, but
      // we pick the column with the highest max-width so the effect is minimal.
      state.columns[widest].maxWidth = FLEX;

      // Assign flexible edges based on whether items are to the left or right
      // of the flexible column (which has no edges)
      for (let i = 0; i < widest; i++) {
        state.columns[i].handle = ResizableRegion.Handle.Right;
      }
      for (let i = widest; i < state.columns.length; i++) {
        state.columns[i].handle = ResizableRegion.Handle.Left;
      }
    }
    return state;
  }

  render() {
    const style = {
      position: 'absolute',
      width: '100%',
      height: '100%',
      zIndex: 1,
    };

    // Note - setting the z-index of the sheet is important, even though it's
    // always 1. Assigning a z-index creates a "stacking context" in the browser,
    // so z-indexes inside the sheet are relative to each other, but something in
    // one sheet cannot be on top of something in another sheet.
    // http://philipwalton.com/articles/what-no-one-told-you-about-z-index/

    return (
      <div
        name={'Sheet'}
        style={style}
        className={`sheet mode-${this.state.mode}`}
        data-id={this.props.data.id}
      >
        <Flexbox direction="row" style={{ overflow: 'hidden' }}>
          {this._columnFlexboxElements()}
        </Flexbox>
      </div>
    );
  }
}
