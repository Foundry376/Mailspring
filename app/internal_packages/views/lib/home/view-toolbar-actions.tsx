import React from 'react';
import { FocusedPerspectiveStore, localized } from 'mailspring-exports';
import { ViewMailboxPerspective } from '../view-mailbox-perspective';
import { openViewsHome } from './view-actions';

interface State {
  viewing: boolean;
}

const viewingPageView = () => FocusedPerspectiveStore.current() instanceof ViewMailboxPerspective;

/**
 * The toolbar above a page View: back to the Views home. Editing lives on the floating Edit
 * button over the View, so the toolbar never competes with the authoring panel.
 */
export class ViewToolbarActions extends React.Component<Record<string, never>, State> {
  static displayName = 'ViewToolbarActions';

  _unlisten: () => void;
  state: State = { viewing: viewingPageView() };

  componentDidMount() {
    this._unlisten = FocusedPerspectiveStore.listen(() =>
      this.setState({ viewing: viewingPageView() })
    );
  }

  componentWillUnmount() {
    this._unlisten();
  }

  render() {
    if (!this.state.viewing) return <span />;
    return (
      <div className="view-toolbar-actions">
        <button className="btn btn-toolbar" onClick={openViewsHome} title={localized('All Views')}>
          {localized('All Views')}
        </button>
      </div>
    );
  }
}
