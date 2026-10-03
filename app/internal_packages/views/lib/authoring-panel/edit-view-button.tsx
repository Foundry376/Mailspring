import React from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { panelSource, onPanelSourceChanged } from './store';
import { registerEditButton } from './launch';

interface Props {
  viewId: string;
  /** `page` floats over the View's bottom-right corner; `sidebar` is a small hover pencil. */
  variant: 'page' | 'sidebar';
}

interface State {
  open: boolean;
  working: boolean;
}

function readState(viewId: string): State {
  const source = panelSource();
  if (!source) return { open: false, working: false };
  const session = source.store.session(viewId);
  return {
    open: source.store.activeViewId() === viewId,
    working: !!(session && session.working),
  };
}

const PencilIcon = () => (
  <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true">
    <path
      d="M13.6 3.2a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L7.6 15.6 3.8 16.6l1-3.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M12.2 4.6l3.2 3.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/**
 * The entry point for changing a View with the authoring agent. The page variant stays
 * rendered (just invisible) while the panel is open, so the panel can grow out of it and
 * shrink back into it.
 */
export class EditViewButton extends React.Component<Props, State> {
  static displayName = 'EditViewButton';

  _unlisten: () => void = null;
  _unlistenSource: () => void = null;
  state: State = readState(this.props.viewId);

  componentDidMount() {
    this._subscribe();
    this._unlistenSource = onPanelSourceChanged(this._subscribe);
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    if (this._unlistenSource) this._unlistenSource();
    if (this.props.variant === 'page') registerEditButton(this.props.viewId, null);
  }

  _subscribe = () => {
    if (this._unlisten) this._unlisten();
    const source = panelSource();
    this._unlisten = source ? source.store.listen(this._onChange) : null;
    this._onChange();
  };

  _onChange = () => {
    const next = readState(this.props.viewId);
    if (next.open !== this.state.open || next.working !== this.state.working) {
      this.setState(next);
    }
  };

  _onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    // Required lazily: index.ts imports this component.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { openPanelForView } = require('./index');
    openPanelForView(this.props.viewId).catch((err) => {
      AppEnv.showErrorDialog({ title: localized('Views'), message: err.message });
    });
  };

  render() {
    const { variant, viewId } = this.props;
    const { open, working } = this.state;
    return (
      <button
        ref={variant === 'page' ? (el) => registerEditButton(viewId, el) : undefined}
        className={classnames('view-edit-button', `variant-${variant}`, { hidden: open, working })}
        onClick={this._onClick}
        tabIndex={open ? -1 : 0}
        title={working ? localized('The assistant is working on this View') : localized('Edit')}
        aria-label={localized('Edit this View with the assistant')}
      >
        <PencilIcon />
        {working && <span className="view-edit-button-dot" aria-hidden="true" />}
      </button>
    );
  }
}
