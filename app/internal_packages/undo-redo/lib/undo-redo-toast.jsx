import React from 'react';
import { UndoRedoStore } from 'mailspring-exports';
import { UndoToast } from 'mailspring-component-kit';

export default class UndoRedoToast extends React.Component {
  static displayName = 'UndoRedoToast';
  static containerRequired = false;

  constructor(props) {
    super(props);

    // Note: we explicitly do /not/ set initial state to the state of
    // the UndoRedoStore here because "getMostRecent" might be more
    // than 3000ms old.
    this.state = { block: null };
  }

  componentDidMount() {
    this._unlisten = UndoRedoStore.listen(() => {
      this.setState({
        block: UndoRedoStore.getMostRecent(),
      });
    });
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  render() {
    return (
      <UndoToast
        visible={!!this.state.block}
        visibleDuration={3000}
        className="undo-redo-thread-list-toast"
        onUndo={() => AppEnv.commands.dispatch('core:undo')}
        undoMessage={this.state.block && this.state.block.description}
      />
    );
  }
}
