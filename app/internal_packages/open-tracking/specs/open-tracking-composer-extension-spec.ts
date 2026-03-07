import { Message } from 'mailspring-exports';
import OpenTrackingComposerExtension, {
  encodeOpenTrackingToken,
} from '../lib/open-tracking-composer-extension';
import { PLUGIN_ID, PLUGIN_URL } from '../lib/open-tracking-constants';

const accountId = 'fake-accountId';
const clientId = 'local-31d8df57-1442';
const beforeBody = `TEST_BODY <blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;"> On Feb 25 2016, at 3:38 pm, Drew &lt;drew@mailspring.com&gt; wrote: <br> twst </blockquote>`;

// Build the expected pixel URL using the same token-encoding logic the
// extension uses at send time. The img tag intentionally has no class,
// dimensions, or branded alt text to avoid tracking-pixel blockers.
const expectedToken = encodeOpenTrackingToken({ messageId: clientId, accountId });
const afterBody = `TEST_BODY <img alt="" src="${PLUGIN_URL}/o/${expectedToken}.png"><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;"> On Feb 25 2016, at 3:38 pm, Drew &lt;drew@mailspring.com&gt; wrote: <br> twst </blockquote>`;

const nodeForHTML = (html) => {
  const fragment = document.createDocumentFragment();
  const node = document.createElement('root');
  fragment.appendChild(node);
  node.innerHTML = html;
  return node;
};

xdescribe('Open tracking composer extension', function openTrackingComposerExtension() {
  describe('applyTransformsForSending', () => {
    beforeEach(() => {
      this.draftBodyRootNode = nodeForHTML(beforeBody);
      this.draft = new Message({
        accountId: accountId,
        body: beforeBody,
      });
    });

    it('takes no action if there is no metadata', () => {
      OpenTrackingComposerExtension.applyTransformsForSending({
        draftBodyRootNode: this.draftBodyRootNode,
        draft: this.draft,
      });
      const actualAfterBody = this.draftBodyRootNode.innerHTML;
      expect(actualAfterBody).toEqual(beforeBody);
    });

    describe('With properly formatted metadata and correct params', () => {
      beforeEach(() => {
        this.metadata = { open_count: 0 };
        this.draft.directlyAttachMetadata(PLUGIN_ID, this.metadata);

        OpenTrackingComposerExtension.applyTransformsForSending({
          draftBodyRootNode: this.draftBodyRootNode,
          draft: this.draft,
        });
        this.metadata = this.draft.metadataForPluginId(PLUGIN_ID);
      });

      it('appends an image with the correct server URL to the unquoted body', () => {
        const actualAfterBody = this.draftBodyRootNode.innerHTML;
        expect(actualAfterBody).toEqual(afterBody);
      });
    });
  });
});
