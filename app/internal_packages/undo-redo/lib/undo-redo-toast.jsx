import { React, UndoRedoStore } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CSSTransitionGroup } from 'react-transition-group';

const VISIBLE_DURATION = 3000;

export default class UndoRedoToast extends React.Component {
  static displayName = 'UndoRedoToast';
  static containerRequired = false;

  constructor(props) {
    super(props);

    this._timeout = null;
    this._unlisten = null;
    this._mounted = false;

    // Note: we explicitly do /not/ set initial state to the state of
    // the UndoRedoStore here because "getMostRecent" might be more
    // than 3000ms old.
    this.state = {
      block: null,
    };
  }

  componentDidMount() {
    this._mounted = true;
    this._unlisten = UndoRedoStore.listen(() => {
      this.setState({
        block: UndoRedoStore.getMostRecent(),
      });
    });
  }

  componentDidUpdate() {
    this._ensureTimeout();
  }

  componentWillUnmount() {
    this._mounted = false;
    this._clearTimeout();
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _clearTimeout() {
    clearTimeout(this._timeout);
    this._timeout = null;
  }

  _ensureTimeout() {
    this._clearTimeout();

    if (this.state.block) {
      this._timeout = setTimeout(() => {
        this._mounted = false;
        this.setState({ block: null });
      }, VISIBLE_DURATION);
    }
  }

  _onMouseEnter = () => {
    this._clearTimeout();
  };

  _onMouseLeave = () => {
    this._ensureTimeout();
  };

  render() {
    const { block } = this.state;

    return (
      <CSSTransitionGroup
        className="undo-redo-toast"
        transitionLeaveTimeout={150}
        transitionEnterTimeout={150}
        transitionName="undo-redo-toast-fade"
      >
        {block ? (
          <div
            className="content"
            onMouseEnter={this._onMouseEnter}
            onMouseLeave={this._onMouseLeave}
          >
            <div className="message">{block.description}</div>
            <div className="action" onClick={() => AppEnv.commands.dispatch('core:undo')}>
              <RetinaImg name="undo-icon@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
              <span className="undo-action-text">Undo</span>
            </div>
          </div>
        ) : null}
      </CSSTransitionGroup>
    );
  }
}
