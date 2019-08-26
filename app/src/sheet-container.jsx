import React from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import { WorkspaceStore } from 'mailspring-exports';

import Sheet from './sheet';
import Toolbar from './sheet-toolbar';
import Flexbox from './components/flexbox';
import InjectedComponentSet from './components/injected-component-set';

export default class SheetContainer extends React.Component {
  static displayName = 'SheetContainer';

  constructor(props) {
    super(props);
    this._toolbarComponents = null;
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribe = WorkspaceStore.listen(this._onStoreChange);
  }

  componentDidCatch(error, info) {
    // We don't currently display the error, but we need to call setState within
    // this function or the component does not re-render after being reset.
    this.setState({ error: error.stack });
    AppEnv.reportError(error);
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _getStateFromStores() {
    return {
      stack: WorkspaceStore.sheetStack(),
      mode: WorkspaceStore.layoutMode(),
    };
  }

  _onColumnSizeChanged = () => {
    const toolbar = this._toolbarComponents;
    if (toolbar) {
      toolbar.recomputeLayout();
    }
    window.dispatchEvent(new Event('resize'));
  };

  _onStoreChange = () => {
    this.setState(this._getStateFromStores());
  };

  _toolbarContainerElement() {
    const rootSheet = this.state.stack[0];
    const { toolbar } = AppEnv.getLoadSettings();
    if (!toolbar) {
      return [];
    }
    return (
      <div
        name="Toolbar"
        style={{
          order: 0,
          zIndex: 3,
          position: 'fixed',
          width: '100%',
          left: 0,
          top: 0,
        }}
        className="sheet-toolbar"
      >
        <Toolbar
          data={rootSheet}
          ref={cm => {
            this._toolbarComponents = cm;
          }}
        />
        {/* <CSSTransitionGroup
          transitionLeaveTimeout={125}
          transitionEnterTimeout={125}
          transitionName="opacity-125ms"
        >
          {components.slice(1)}
        </CSSTransitionGroup> */}
      </div>
    );
  }

  render() {
    const totalSheets = this.state.stack.length;
    const topSheet = this.state.stack[totalSheets - 1];

    if (!topSheet) {
      return <div />;
    }
    let rootSheet = null;
    let popSheet = null;
    if (['Preferences', 'Thread'].includes(topSheet.id)) {
      rootSheet = (
        <Sheet
          depth={0}
          data={this.state.stack[0]}
          key="root"
          onColumnSizeChanged={this._onColumnSizeChanged}
        />
      );
      popSheet = (
        <Sheet
          depth={this.state.stack.length - 1}
          data={this.state.stack[this.state.stack.length - 1]}
          key="top"
          onColumnSizeChanged={this._onColumnSizeChanged}
        />
      );
    } else {
      rootSheet = (
        <Sheet
          depth={this.state.stack.length - 1}
          data={this.state.stack[this.state.stack.length - 1]}
          key="root"
          onColumnSizeChanged={this._onColumnSizeChanged}
        />
      );
    }

    return (
      <Flexbox
        direction="column"
        className={`layout-mode-${this.state.mode}`}
        style={{ overflow: 'hidden' }}
      >
        {this._toolbarContainerElement()}

        {/* <div name="Header" style={{ order: 1, zIndex: 2 }}>
          <InjectedComponentSet
            matching={{ locations: [topSheet.Header] }}
            direction="column"
            id={topSheet.id}
          />
        </div> */}

        <div
          id="Center"
          name="Center"
          style={{ height: '100%', order: 2, flex: 1, position: 'relative', zIndex: 1 }}
        >
          {rootSheet}
          {popSheet}
        </div>

        <div name="Footer" style={{ order: 3, zIndex: 4 }}>
          <InjectedComponentSet
            matching={{ locations: [topSheet.Footer, WorkspaceStore.Sheet.Global.Footer] }}
            direction="column"
            id={topSheet.id}
          />
        </div>
      </Flexbox>
    );
  }
}
