import { ComposerExtension, FeatureUsageStore, Message, Contact } from 'mailspring-exports';

import { PLUGIN_ID, PLUGIN_URL } from './open-tracking-constants';
import { OpenTrackingMetadata } from './types';

/**
 * Encode open-tracking parameters into a single URL-safe Base64 token.
 *
 * The token is a Base64url-encoded JSON payload containing the message ID,
 * account ID, and (optionally) the recipient email. This replaces the previous
 * approach of passing these values as query-string parameters, which made the
 * tracking pixel trivially identifiable by blockers.
 *
 * The server must decode the token with the inverse operation — see
 * docs/open-tracking-backend-changes.md for details.
 */
export function encodeOpenTrackingToken(params: {
  messageId: string;
  accountId: string;
  recipient?: string;
}): string {
  const json = JSON.stringify(params);
  // Standard Base64, then converted to URL-safe variant (RFC 4648 §5)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default class OpenTrackingComposerExtension extends ComposerExtension {
  static needsPerRecipientBodies(draft) {
    return !draft.plaintext && !!draft.metadataForPluginId(PLUGIN_ID);
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
    if (draft.plaintext) {
      return;
    }

    // grab message metadata, if any
    const messageUid = draft.headerMessageId;
    const metadata = draft.metadataForPluginId(PLUGIN_ID) as OpenTrackingMetadata;
    if (!metadata) {
      return;
    }

    // Build an opaque token containing the tracking parameters. The server
    // decodes this token instead of reading query-string parameters, which
    // makes the URL indistinguishable from a regular image request.
    const tokenParams: { messageId: string; accountId: string; recipient?: string } = {
      messageId: draft.headerMessageId,
      accountId: draft.accountId,
    };
    if (recipient) {
      tokenParams.recipient = recipient.email;
    }

    const token = encodeOpenTrackingToken(tokenParams);
    const serverUrl = `${PLUGIN_URL}/o/${token}.png`;

    // The <img> tag intentionally omits zero-dimension attributes, CSS class
    // names, and branded alt text. These are the primary heuristics that
    // email-client tracking-pixel blockers use for detection. The server
    // returns a 1x1 transparent PNG so the image remains invisible in
    // practice without telegraphing its purpose in the markup.
    const imgFragment = document
      .createRange()
      .createContextualFragment(`<img alt="" src="${serverUrl}">`);
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
