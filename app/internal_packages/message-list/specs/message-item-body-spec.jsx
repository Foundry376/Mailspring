const proxyquire = require('proxyquire');
import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';

import { Contact, Message, File, AttachmentStore, MessageBodyProcessor } from 'mailspring-exports';

class EmailFrameStub extends React.Component {
  render() {
    return <div />;
  }
}

const file = new File({
  id: 'file_1_id',
  filename: 'a.png',
  contentType: 'image/png',
  size: 10,
});
const file_not_downloaded = new File({
  id: 'file_2_id',
  filename: 'b.png',
  contentType: 'image/png',
  size: 10,
});
const file_inline = new File({
  id: 'file_inline_id',
  filename: 'c.png',
  contentId: 'file_inline_id',
  contentType: 'image/png',
  size: 10,
});
const file_inline_downloading = new File({
  id: 'file_inline_downloading_id',
  filename: 'd.png',
  contentId: 'file_inline_downloading_id',
  contentType: 'image/png',
  size: 10,
});
const file_inline_not_downloaded = new File({
  id: 'file_inline_not_downloaded_id',
  filename: 'e.png',
  contentId: 'file_inline_not_downloaded_id',
  contentType: 'image/png',
  size: 10,
});
const file_cid_but_not_referenced = new File({
  id: 'file_cid_but_not_referenced',
  filename: 'f.png',
  contentId: 'file_cid_but_not_referenced',
  contentType: 'image/png',
  size: 10,
});
const file_cid_but_not_referenced_or_image = new File({
  id: 'file_cid_but_not_referenced_or_image',
  filename: 'ansible notes.txt',
  contentId: 'file_cid_but_not_referenced_or_image',
  contentType: 'text/plain',
  size: 300,
});
const file_without_filename = new File({
  id: 'file_without_filename',
  contentType: 'image/png',
  size: 10,
});

const download = { fileId: 'file_1_id' };
const download_inline = { fileId: 'file_inline_downloading_id' };

const user_1 = new Contact({
  name: 'User One',
  email: 'user1@nylas.com',
});
const user_2 = new Contact({
  name: 'User Two',
  email: 'user2@nylas.com',
});
const user_3 = new Contact({
  name: 'User Three',
  email: 'user3@nylas.com',
});
const user_4 = new Contact({
  name: 'User Four',
  email: 'user4@nylas.com',
});

const MessageItemBody = proxyquire('../lib/message-item-body', {
  './email-frame': { default: EmailFrameStub },
});

xdescribe('MessageItem', function() {
  beforeEach(function() {
    spyOn(AttachmentStore, 'pathForFile').andCallFake(function(f) {
      if (f.id === file.id) {
        return '/fake/path.png';
      }
      if (f.id === file_inline.id) {
        return '/fake/path-inline.png';
      }
      if (f.id === file_inline_downloading.id) {
        return '/fake/path-downloading.png';
      }
      return null;
    });
    spyOn(MessageBodyProcessor, '_addToCache').andCallFake(function() {});

    this.downloads = {
      file_1_id: download,
      file_inline_downloading_id: download_inline,
    };

    this.message = new Message({
      id: '111',
      from: [user_1],
      to: [user_2],
      cc: [user_3, user_4],
      bcc: null,
      body: 'Body One',
      date: new Date(1415814587),
      draft: false,
      files: [],
      unread: false,
      snippet: 'snippet one...',
      subject: 'Subject One',
      threadId: 'thread_12345',
      accountId: TEST_ACCOUNT_ID,
    });

    // Generate the test component. Should be called after @message is configured
    // for the test, since MessageItem assumes attributes of the message will not
    // change after getInitialState runs.
    this.createComponent = param => {
      if (param == null) {
        param = {};
      }
      let { collapsed } = param;
      if (collapsed == null) {
        collapsed = false;
      }
      this.component = ReactTestUtils.renderIntoDocument(
        <MessageItemBody message={this.message} downloads={this.downloads} />
      );
      advanceClock();
    };
  });

  describe('when the message contains attachments', function() {
    beforeEach(function() {
      this.message.files = [
        file,
        file_not_downloaded,
        file_cid_but_not_referenced,
        file_cid_but_not_referenced_or_image,

        file_inline,
        file_inline_downloading,
        file_inline_not_downloaded,
        file_without_filename,
      ];
    });

    describe('inline', function() {
      beforeEach(function() {
        this.message.body = `\
<img alt="A" src="cid:${file_inline.contentId}"/>
<img alt="B" src="cid:${file_inline_downloading.contentId}"/>
<img alt="C" src="cid:${file_inline_not_downloaded.contentId}"/>
<img src="cid:missing-attachment"/>
Hello world!\
`;
        this.createComponent();
        waitsFor(() => {
          return ReactTestUtils.scryRenderedComponentsWithType(this.component, EmailFrameStub)
            .length;
        });
      });

      it('should never leave src=cid: in the message body', function() {
        runs(() => {
          const body = ReactTestUtils.findRenderedComponentWithType(this.component, EmailFrameStub)
            .props.content;
          expect(body.indexOf('cid')).toEqual(-1);
        });
      });

      it("should replace cid:<file.contentId> with the AttachmentStore's path for the file", function() {
        runs(() => {
          const body = ReactTestUtils.findRenderedComponentWithType(this.component, EmailFrameStub)
            .props.content;
          expect(body.indexOf('alt="A" src="file:///fake/path-inline.png"')).toEqual(
            this.message.body.indexOf('alt="A"')
          );
        });
      });

      it("should not replace cid:<file.contentId> with the AttachmentStore's path if the download is in progress", function() {
        runs(() => {
          const body = ReactTestUtils.findRenderedComponentWithType(this.component, EmailFrameStub)
            .props.content;
          expect(body.indexOf('/fake/path-downloading.png')).toEqual(-1);
        });
      });
    });
  });

  describe('showQuotedText', function() {
    it('should be initialized to false', function() {
      this.createComponent();
      expect(this.component.state.showQuotedText).toBe(false);
    });

    it("shouldn't render the quoted text control if there's no quoted text", function() {
      this.message.body = 'no quotes here!';
      this.createComponent();
      const toggles = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.component,
        'quoted-text-control'
      );
      expect(toggles.length).toBe(0);
    });

    describe('quoted text control toggle button', function() {
      beforeEach(function() {
        this.message.body = `\
Message
<blockquote class="gmail_quote">
  Quoted message
</blockquote>\
`;
        this.createComponent();
        this.toggle = ReactTestUtils.findRenderedDOMComponentWithClass(
          this.component,
          'quoted-text-control'
        );
      });

      it('should be rendered', function() {
        expect(this.toggle).toBeDefined();
      });
    });

    it('should be initialized to true if the message contains `Forwarded`...', function() {
      this.message.body = `\
Hi guys, take a look at this. Very relevant. -mg
<br>
<br>
<div class="gmail_quote">
  ---- Forwarded Message -----
  blablalba
</div>\
`;
      this.createComponent();
      expect(this.component.state.showQuotedText).toBe(true);
    });

    it('should be initialized to false if the message is a response to a Forwarded message', function() {
      this.message.body = `\
Thanks mg, that indeed looks very relevant. Will bring it up
with the rest of the team.

On Sunday, March 4th at 12:32AM, Michael Grinich Wrote:
<div class="gmail_quote">
  Hi guys, take a look at this. Very relevant. -mg
  <br>
  <br>
  <div class="gmail_quote">
    ---- Forwarded Message -----
    blablalba
  </div>
</div>\
`;
      this.createComponent();
      expect(this.component.state.showQuotedText).toBe(false);
    });

    describe('when showQuotedText is true', function() {
      beforeEach(function() {
        this.message.body = `\
Message
<blockquote class="gmail_quote">
  Quoted message
</blockquote>\
`;
        this.createComponent();
        this.component.state.showQuotedText = true;
        waitsFor(() => {
          return ReactTestUtils.scryRenderedComponentsWithType(this.component, EmailFrameStub)
            .length;
        });
      });

      describe('quoted text control toggle button', function() {
        beforeEach(function() {
          this.toggle = ReactTestUtils.findRenderedDOMComponentWithClass(
            this.component,
            'quoted-text-control'
          );
        });

        it('should be rendered', function() {
          expect(this.toggle).toBeDefined();
        });
      });

      it('should pass the value into the EmailFrame', function() {
        runs(() => {
          const frame = ReactTestUtils.findRenderedComponentWithType(
            this.component,
            EmailFrameStub
          );
          expect(frame.props.showQuotedText).toBe(true);
        });
      });
    });
  });
});
