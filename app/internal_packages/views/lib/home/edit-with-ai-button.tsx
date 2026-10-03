import React from 'react';
import { FocusedPerspectiveStore, localized } from 'mailspring-exports';
import { ViewMailboxPerspective } from '../view-mailbox-perspective';
import { installedViews } from '../view-registry';
import { editWithAI } from './agent-adapter';
import { openViewsHome } from './view-actions';

interface State {
  view: { id: string; name: string; source: string } | null;
}

function focusedView() {
  const perspective = FocusedPerspectiveStore.current();
  if (!(perspective instanceof ViewMailboxPerspective)) return null;
  return installedViews().find((v) => v.id === perspective.viewId) || null;
}

/**
 * Toolbar actions above a page View: back to the Views home, and Edit with AI. They live in
 * the app's toolbar rather than over the webview so they never cover the View's content.
 */
export class ViewToolbarActions extends React.Component<Record<string, never>, State> {
  static displayName = 'ViewToolbarActions';

  _unlisten: () => void;
  state: State = { view: focusedView() };

  componentDidMount() {
    this._unlisten = FocusedPerspectiveStore.listen(() => this.setState({ view: focusedView() }));
  }

  componentWillUnmount() {
    this._unlisten();
  }

  _onEdit = async () => {
    const { view } = this.state;
    try {
      await editWithAI(view.id, view.name);
    } catch (err) {
      AppEnv.showErrorDialog({ title: localized('Views'), message: err.message });
    }
  };

  render() {
    const { view } = this.state;
    if (!view) return <span />;
    return (
      <div className="view-toolbar-actions">
        <button className="btn btn-toolbar" onClick={openViewsHome} title={localized('All Views')}>
          {localized('All Views')}
        </button>
        {view.source !== 'example' && (
          <button className="btn btn-toolbar" onClick={this._onEdit}>
            {localized('Edit with AI')}
          </button>
        )}
      </div>
    );
  }
}
