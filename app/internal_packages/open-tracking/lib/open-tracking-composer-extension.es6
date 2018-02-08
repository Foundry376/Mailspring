import { ComposerExtension, FeatureUsageStore } from 'mailspring-exports';
import { PLUGIN_ID, PLUGIN_URL } from './open-tracking-constants';

export default class OpenTrackingComposerExtension extends ComposerExtension {
  static needsPerRecipientBodies(draft) {
    return !!draft.metadataForPluginId(PLUGIN_ID);
  }

  static applyTransformsForSending({ draftBodyRootNode, draft, recipient }) {
    // grab message metadata, if any
    const messageUid = draft.clientId;
    const metadata = draft.metadataForPluginId(PLUGIN_ID);
    if (!metadata) {
      return;
    }

    // insert a tracking pixel <img> into the message
    const q = recipient ? `?recipient=${encodeURIComponent(recipient.email)}` : '';
    const serverUrl = `${PLUGIN_URL}/open/${draft.headerMessageId}${q}`;
    const imgFragment = document
      .createRange()
      .createContextualFragment(
        `<img class="mailspring-open" alt="Open Tracking" width="0" height="0" style="border:0; width:0; height:0;" src="${serverUrl}">`
      );
    const beforeEl = draftBodyRootNode.querySelector('.gmail_quote');
    if (beforeEl) {
      beforeEl.parentNode.insertBefore(imgFragment, beforeEl);
    } else {
      draftBodyRootNode.appendChild(imgFragment);
    }

    // save the uid info to draft metadata
    metadata.uid = messageUid;
    draft.directlyAttachMetadata(PLUGIN_ID, metadata);
  }

  static onSendSuccess(draft) {
    const metadata = draft.metadataForPluginId(PLUGIN_ID);
    if (metadata) {
      FeatureUsageStore.markUsed(PLUGIN_ID);
    }
  }
}
