import React from 'react';
import ReactDOM from 'react-dom';
import { Account, AccountStore, Contact, Message, SendDraftTask } from 'mailspring-exports';
import SignaturePhotoPicker from '../lib/signature-photo-picker';
import { RenderSignatureData, ResolveSignatureData } from '../lib/constants';
import { applySignature } from '../lib/signature-utils';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNikAQAACIAHF/uBd8AAAAASUVORK5CYII=';

describe('Local signature photos', () => {
  it('embeds a selected image locally without an identity or upload', async () => {
    const container = document.createElement('div');
    const onChange = jasmine.createSpy('onChange');
    let picker: SignaturePhotoPicker;
    ReactDOM.render(
      <SignaturePhotoPicker
        ref={(instance) => (picker = instance)}
        id="test"
        data={{}}
        resolvedURL=""
        onChange={onChange}
      />,
      container
    );
    try {
      await picker._onChooseImageBlob(new Blob(['local image'], { type: 'image/png' }));
      expect(onChange).toHaveBeenCalledWith({
        target: { value: 'data:image/png;base64,bG9jYWwgaW1hZ2U=', id: 'photoURL' },
      });
      expect(picker.state.isUploading).toBe(false);
    } finally {
      ReactDOM.unmountComponentAtNode(container);
    }
  });

  it('does not resolve remote photo services or legacy hosted photos', () => {
    for (const photoURL of [
      'gravatar',
      'company',
      'custom',
      'https://getmailspring.com/photo.png',
    ]) {
      expect(ResolveSignatureData({ photoURL, email: 'person@example.test' }).photoURL).toBe('');
    }
    expect(ResolveSignatureData({ photoURL: image }).photoURL).toBe(image);
  });

  for (const graphSend of [false, true]) {
    it(`preserves embedded images and original links in the ${graphSend ? 'Graph' : 'SMTP'} send body`, () => {
      spyOn(AccountStore, 'accountForId').andReturn(
        new Account({
          id: 'signature-account',
          settings: { graph_send: graphSend },
        } as any)
      );
      const signature = RenderSignatureData({
        templateName: 'SignatureA',
        name: 'Local Person',
        photoURL: image,
        githubURL: 'local-person',
      });
      const draft = new Message({
        accountId: 'signature-account',
        from: [new Contact({ email: 'me@example.test' })],
        to: [new Contact({ email: 'reader@example.test' })],
        body: applySignature('<p>Hello <a href="https://example.test/original">original</a></p>', {
          id: 'local-signature',
          body: signature,
        }),
      });
      const task = SendDraftTask.forSending(draft);
      expect(task.draft.body).toContain(`src="${image}"`);
      expect(task.draft.body).toContain('href="https://example.test/original"');
      expect(task.draft.body).toContain('Local Person');
      expect(task.draft.body).not.toContain('getmailspring.com');
    });
  }
});
