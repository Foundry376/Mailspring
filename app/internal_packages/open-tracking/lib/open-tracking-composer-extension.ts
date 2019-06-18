import { ComposerExtension, FeatureUsageStore, Message, Contact } from 'mailspring-exports';
import qs from 'querystring';

import { PLUGIN_ID, PLUGIN_URL } from './open-tracking-constants';
import { OpenTrackingMetadata } from './types';

export default class OpenTrackingComposerExtension extends ComposerExtension {
  static needsPerRecipientBodies(draft) {
    return !!draft.metadataForPluginId(PLUGIN_ID);
  }

  static applyTransformsForSending({
    draftBodyRootNode,
    draft,
    recipient,
  }: {
    draftBodyRootNode: HTMLElement;
    draft: Message;
    recipient?: Contact;
  }) {
    // grab message metadata, if any
    const messageUid = draft.headerMessageId;
    const metadata = draft.metadataForPluginId(PLUGIN_ID) as OpenTrackingMetadata;
    if (!metadata) {
      return;
    }

    // insert a tracking pixel <img> into the message
    const query: { [key: string]: string } = { me: draft.accountId };
    if (recipient) query.recipient = btoa(recipient.email);

    const serverUrl = `${PLUGIN_URL}/open/${draft.headerMessageId}?${qs.stringify(query)}`;
    const imgFragment = document
      .createRange()
      .createContextualFragment(
        `<img class="mailspring-open" alt="Sent from Mailspring" width="0" height="0" style="border:0; width:0; height:0;" src="${serverUrl}">`
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
