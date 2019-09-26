/* eslint react/sort-comp: 0 */
import _ from 'underscore';
import React from 'react';
import {
  Message,
  localized,
  DraftStore,
  WorkspaceStore,
  ComponentRegistry,
  InflatesDraftClientId,
} from 'mailspring-exports';
import ComposeButton from './compose-button';
import ComposerView from './composer-view';

const ComposerViewForDraftClientId = InflatesDraftClientId(ComposerView);

class ComposerWithWindowProps extends React.Component<
  {},
  { headerMessageId: string; errorMessage?: string; errorDetail?: string }
> {
  static displayName = 'ComposerWithWindowProps';
  static containerRequired = false;

  _usub?: () => void;
  _composerComponent?: any;

  constructor(props) {
    super(props);

    // We'll now always have windowProps by the time we construct this.
    const windowProps = AppEnv.getWindowProps();
    const { draftJSON, headerMessageId } = windowProps;
    if (!draftJSON) {
      throw new Error('Initialize popout composer windows with valid draftJSON');
    }
    const draft = new Message({}).fromJSON(draftJSON);
    DraftStore._createSession(headerMessageId, draft);
    this.state = windowProps;
  }

  componentWillUnmount() {
    if (this._usub) {
      this._usub();
    }
  }

  componentDidUpdate() {
    this._composerComponent.focus();
  }

  _onDraftReady = async () => {
    await this._composerComponent.focus();
    AppEnv.displayWindow();

    if (this.state.errorMessage) {
      this._showInitialErrorDialog(this.state.errorMessage, this.state.errorDetail);
    }
  };

  render() {
    return (
      <ComposerViewForDraftClientId
        ref={cm => {
          this._composerComponent = cm;
        }}
        onDraftReady={this._onDraftReady}
        headerMessageId={this.state.headerMessageId}
        className="composer-full-window"
      />
    );
  }

  _showInitialErrorDialog(msg, detail) {
    // We delay so the view has time to update the restored draft. If we
    // don't delay the modal may come up in a state where the draft looks
    // like it hasn't been restored or has been lost.
    _.delay(() => {
      AppEnv.showErrorDialog({ title: localized('Error'), message: msg }, { detail: detail });
    }, 100);
  }
}

export function activate() {
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.register(ComposerViewForDraftClientId, {
      role: 'Composer',
    });
    ComponentRegistry.register(ComposeButton, {
      location: WorkspaceStore.Location.RootSidebar.Toolbar,
    });
  } else if (AppEnv.isThreadWindow()) {
    ComponentRegistry.register(ComposerViewForDraftClientId, {
      role: 'Composer',
    });
  } else {
    AppEnv.getCurrentWindow().setMinimumSize(480, 250);
    ComponentRegistry.register(ComposerWithWindowProps, {
      location: WorkspaceStore.Location.Center,
    });
  }

  setTimeout(() => {
    // preload the font awesome icons used in the composer after a short delay.
    // unfortunately, the icon set takes enough time to load that it introduces jank
    const i = document.createElement('i');
    i.className = 'fa fa-list';
    i.style.position = 'absolute';
    i.style.top = '-20px';
    document.body.appendChild(i);
  }, 1000);
}

export function deactivate() {
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.unregister(ComposerViewForDraftClientId);
    ComponentRegistry.unregister(ComposeButton);
  } else {
    ComponentRegistry.unregister(ComposerWithWindowProps);
  }
}

export function serialize() {
  return this.state;
}
