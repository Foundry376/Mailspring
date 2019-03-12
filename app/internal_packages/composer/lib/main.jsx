/* eslint react/sort-comp: 0 */
import _ from 'underscore';
import React from 'react';
import {ipcRenderer} from 'electron'
import {
  Message,
  DraftStore,
  WorkspaceStore,
  ComponentRegistry,
  InflatesDraftClientId,
  Actions,
} from 'mailspring-exports';
import ComposeButton from './compose-button';
import ComposerView from './composer-view';

const ComposerViewForDraftClientId = InflatesDraftClientId(ComposerView);

class ComposerWithWindowProps extends React.Component {
  static displayName = 'ComposerWithWindowProps';
  static containerRequired = false;

  constructor(props) {
    super(props);

    // We'll now always have windowProps by the time we construct this.
    const windowProps = AppEnv.getWindowProps();
    const { draftJSON, headerMessageId } = windowProps;
    if (!draftJSON) {
      throw new Error('Initialize popout composer windows with valid draftJSON');
    }
    const draft = new Message().fromJSON(draftJSON);
    DraftStore._createSession(headerMessageId, draft);
    this.state = windowProps;
    this.state.messageId = draft.id;
    this._mounted = false;
    this._unlisten = Actions.changeDraftAccountComplete.listen(this._onDraftChangeAccountComplete, this);
  }
  componentWillMount() {
    ipcRenderer.on('draft-got-new-id', this._onDraftGotNewId);
  }
  componentDidMount() {
    this._mounted = true;
  }

  _onDraftChangeAccountComplete = ({ newDraftJSON }) => {
    const draft = new Message().fromJSON(newDraftJSON);
    DraftStore._createSession(draft.headerMessageId, draft);
    this.setState({ headerMessageId: draft.headerMessageId, messageId: draft.id });
  };

  _onDraftGotNewId = (event, options) => {
    if (
      options.referenceMessageId &&
      options.newHeaderMessageId &&
      options.newMessageId &&
      options.referenceMessageId === this.state.messageId
    ) {
      this.setState({
        headerMessageId: options.newHeaderMessageId,
        messageId: options.newMessageId,
      });
    }
  };

  componentWillUnmount() {
    this._mounted = false;
    if (this._usub) {
      this._usub();
    }
    this._unlisten();
    ipcRenderer.removeListener('draft-got-new-id', this._onDraftGotNewId);
  }

  componentDidUpdate() {
    this._composerComponent.focus();
  }

  _onDraftReady = () => {
    this._composerComponent.focus().then(() => {
      AppEnv.displayWindow();

      if (this.state.errorMessage) {
        this._showInitialErrorDialog(this.state.errorMessage, this.state.errorDetail);
      }
    });
  };

  render() {
    return (
      <ComposerViewForDraftClientId
        ref={cm => {
          this._composerComponent = cm;
        }}
        onDraftReady={this._onDraftReady}
        headerMessageId={this.state.headerMessageId}
        messageId={this.state.messageId}
        className="composer-full-window"
      />
    );
  }

  _showInitialErrorDialog(msg, detail) {
    // We delay so the view has time to update the restored draft. If we
    // don't delay the modal may come up in a state where the draft looks
    // like it hasn't been restored or has been lost.
    _.delay(() => {
      AppEnv.showErrorDialog({ title: 'Error', message: msg }, { detail: detail });
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
    i.style.top = 0;
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
