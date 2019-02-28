import React from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import { WorkspaceStore } from 'mailspring-exports';

import Sheet from './sheet';
import Toolbar from './sheet-toolbar';
import Flexbox from './components/flexbox';
import InjectedComponentSet from './components/injected-component-set';
import { SheetDeclaration } from './flux/stores/workspace-store';

interface SheetContainerState {
  stack: SheetDeclaration[];
  mode: string;
  error?: string;
}

export default class SheetContainer extends React.Component<{}, SheetContainerState> {
  static displayName = 'SheetContainer';

  _toolbarComponents = {};
  unsubscribe?: () => void;

  constructor(props) {
    super(props);
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

  _onColumnSizeChanged = sheet => {
    const toolbar = this._toolbarComponents[sheet.props.depth];
    if (toolbar) {
      toolbar.recomputeLayout();
    }
    window.dispatchEvent(new Event('resize'));
  };

  _onStoreChange = () => {
    this.setState(this._getStateFromStores());
  };

  _toolbarContainerElement() {
    const { toolbar } = AppEnv.getLoadSettings();
    if (!toolbar) {
      return [];
    }

    const components = this.state.stack.map((sheet, index) => (
      <Toolbar
        data={sheet}
        ref={cm => {
          this._toolbarComponents[index] = cm;
        }}
        key={`${index}:${sheet.id}:toolbar`}
        depth={index}
      />
    ));
    return (
      <div style={{ order: 0, zIndex: 3 }} className="sheet-toolbar">
        {components[0]}
        <CSSTransitionGroup
          transitionLeaveTimeout={125}
          transitionEnterTimeout={125}
          transitionName="opacity-125ms"
        >
          {components.slice(1)}
        </CSSTransitionGroup>
      </div>
    );
  }

  render() {
    const totalSheets = this.state.stack.length;
    const topSheet = this.state.stack[totalSheets - 1];

    if (!topSheet) {
      return <div />;
    }

    const sheetComponents = this.state.stack.map((sheet, index) => (
      <Sheet
        data={sheet}
        depth={index}
        key={`${index}:${sheet.id}`}
        onColumnSizeChanged={this._onColumnSizeChanged}
      />
    ));

    return (
      <Flexbox
        direction="column"
        className={`layout-mode-${this.state.mode}`}
        style={{ overflow: 'hidden' }}
      >
        {this._toolbarContainerElement()}

        <div style={{ order: 1, zIndex: 2 }}>
          <InjectedComponentSet
            matching={{ locations: [topSheet.Header, WorkspaceStore.Sheet.Global.Header] }}
            direction="column"
            id={topSheet.id}
          />
        </div>

        <div style={{ order: 2, flex: 1, position: 'relative', zIndex: 1 }}>
          {sheetComponents[0]}
          <CSSTransitionGroup
            transitionLeaveTimeout={125}
            transitionEnterTimeout={125}
            transitionName="sheet-stack"
          >
            {sheetComponents.slice(1)}
          </CSSTransitionGroup>
        </div>

        <div style={{ order: 3, zIndex: 4 }}>
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
