import { ComposerExtension, RegExpUtils, FeatureUsageStore } from 'mailspring-exports';
import { PLUGIN_ID, PLUGIN_URL } from './link-tracking-constants';

function forEachATagInBody(draftBodyRootNode, callback) {
  const treeWalker = document.createTreeWalker(draftBodyRootNode, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => {
      if (node.classList.contains('gmail_quote')) {
        return NodeFilter.FILTER_REJECT; // skips the entire subtree
      }
      return node.hasAttribute('href') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  while (treeWalker.nextNode()) {
    callback(treeWalker.currentNode);
  }
}

/**
 * This replaces all links with a new url that redirects through our
 * cloud-api servers (see cloud-api/routes/link-tracking)
 *
 * This redirect link href is NOT complete at this stage. It requires
 * substantial post processing just before send. This happens in iso-core
 * since sending can happen immediately or later in cloud-workers.
 *
 * See isomorphic-core tracking-utils.es6
 *
 * We also need to add individualized recipients to each tracking pixel
 * for each message sent to each person.
 *
 * We finally need to put the original url back for the message that ends
 * up in the users's sent folder. This ensures the sender doesn't trip
 * their own link tracks.
 */
export default class LinkTrackingComposerExtension extends ComposerExtension {
  static needsPerRecipientBodies(draft) {
    return !!draft.metadataForPluginId(PLUGIN_ID);
  }

  static applyTransformsForSending({ draftBodyRootNode, draft, recipient }) {
    const metadata = draft.metadataForPluginId(PLUGIN_ID);
    if (!metadata) {
      return;
    }
    const messageUid = draft.clientId;
    const links = [];

    forEachATagInBody(draftBodyRootNode, el => {
      const url = el.getAttribute('href');
      if (!RegExpUtils.urlRegex().test(url)) {
        return;
      }
      if (RegExpUtils.mailtoProtocolRegex().test(url)) {
        return; // Ignore mailto links; see #877
      }
      const encoded = encodeURIComponent(url);
      const redirectUrl = `${PLUGIN_URL}/link/${draft.headerMessageId}/${
        links.length
      }?redirect=${encoded}`;

      links.push({
        url,
        click_count: 0,
        click_data: [],
        redirect_url: redirectUrl,
      });

      const qr = recipient ? `&recipient=${encodeURIComponent(btoa(recipient.email))}` : '';
      el.setAttribute('href', `${redirectUrl}${qr}`);
    });

    // save the link info to draft metadata
    metadata.uid = messageUid;
    metadata.links = links;
    draft.directlyAttachMetadata(PLUGIN_ID, metadata);
  }

  static onSendSuccess(draft) {
    const metadata = draft.metadataForPluginId(PLUGIN_ID);
    if (metadata) {
      FeatureUsageStore.markUsed(PLUGIN_ID);
    }
  }
}
