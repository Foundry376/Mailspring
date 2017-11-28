import {
  ComponentRegistry,
  DatabaseStore,
  SyncbackMetadataTask,
  Message,
  SendActionsStore,
  Actions,
} from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';

import SendLaterButton from './send-later-button';
import SendLaterStatus from './send-later-status';
import { PLUGIN_ID } from './send-later-constants';

let unlisten = null;

const SendLaterButtonWithTip = HasTutorialTip(SendLaterButton, {
  title: 'Send on your own schedule',
  instructions:
    'Schedule this message to send at the ideal time. Mailspring makes it easy to control the fabric of spacetime!',
});

function handleMetadataExpiration(change) {
  if (change.type !== 'metadata-expiration' || change.objectClass !== Message.name) {
    return;
  }
  for (const message of change.objects) {
    const metadata = message.metadataForPluginId(PLUGIN_ID);
    if (!metadata || !metadata.expiration || metadata.expiration > new Date()) {
      continue;
    }

    // clear the metadata
    Actions.queueTask(
      SyncbackMetadataTask.forSaving({
        model: message,
        pluginId: PLUGIN_ID,
        value: {
          expiration: null,
        },
      })
    );

    if (!message.draft) {
      continue;
    }

    // send the draft
    const actionKey = metadata.actionKey || SendActionsStore.DefaultSendActionKey;
    Actions.sendDraft(message.headerMessageId, { actionKey, delay: 0 });
  }
}

export function activate() {
  ComponentRegistry.register(SendLaterButtonWithTip, { role: 'Composer:ActionButton' });
  ComponentRegistry.register(SendLaterStatus, { role: 'DraftList:DraftStatus' });

  if (AppEnv.isMainWindow()) {
    unlisten = DatabaseStore.listen(handleMetadataExpiration);
  }
}

export function deactivate() {
  ComponentRegistry.unregister(SendLaterButtonWithTip);
  ComponentRegistry.unregister(SendLaterStatus);
  if (unlisten) {
    unlisten();
  }
}

export function serialize() {}
