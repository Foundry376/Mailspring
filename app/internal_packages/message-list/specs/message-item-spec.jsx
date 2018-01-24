const proxyquire = require('proxyquire');
const React = require('react');
const ReactDOM = require('react-dom');
const ReactTestUtils = require('react-dom/test-utils');

const {
  Contact,
  Message,
  File,
  Thread,
  AttachmentStore,
  MessageBodyProcessor,
} = require('mailspring-exports');

class MessageItemBody extends React.Component {
  render() {
    return <div />;
  }
}

const { InjectedComponent } = require('mailspring-component-kit');

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

const MessageItem = proxyquire('../lib/message-item', { './message-item-body': MessageItemBody });

const MessageTimestamp = require('../lib/message-timestamp').default;

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
    spyOn(AttachmentStore, 'getDownloadDataForFiles').andCallFake(ids => ({
      file_1_id: download,
      file_inline_downloading_id: download_inline,
    }));

    spyOn(MessageBodyProcessor, '_addToCache').andCallFake(function() {});

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

    this.thread = new Thread({
      id: 'thread-111',
      accountId: TEST_ACCOUNT_ID,
    });

    this.threadParticipants = [user_1, user_2, user_3, user_4];

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
        <MessageItem
          key={this.message.id}
          message={this.message}
          thread={this.thread}
          collapsed={collapsed}
        />
      );
    };
  });

  // TODO: We currently don't support collapsed messages
  // describe "when collapsed", ->
  //   beforeEach ->
  //     @createComponent({collapsed: true})
  //
  //   it "should not render the EmailFrame", ->
  //     expect( -> ReactTestUtils.findRenderedComponentWithType(@component, EmailFrameStub)).toThrow()
  //
  //   it "should have the `collapsed` class", ->
  //     expect(ReactDOM.findDOMNode(@component).className.indexOf('collapsed') >= 0).toBe(true)

  describe('when displaying detailed headers', function() {
    beforeEach(function() {
      this.createComponent({ collapsed: false });
      this.component.setState({ detailedHeaders: true });
    });

    it('correctly sets the participant states', function() {
      const participants = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.component,
        'expanded-participants'
      );
      expect(participants.length).toBe(2);
      expect(function() {
        return ReactTestUtils.findRenderedDOMComponentWithClass(
          this.component,
          'collapsed-participants'
        );
      }).toThrow();
    });

    it('correctly sets the timestamp', function() {
      const ts = ReactTestUtils.findRenderedComponentWithType(this.component, MessageTimestamp);
      expect(ts.props.isDetailed).toBe(true);
    });
  });

  describe('when not collapsed', function() {
    beforeEach(function() {
      this.createComponent({ collapsed: false });
    });

    it('should render the MessageItemBody', function() {
      const frame = ReactTestUtils.findRenderedComponentWithType(this.component, MessageItemBody);
      expect(frame).toBeDefined();
    });

    it('should not have the `collapsed` class', function() {
      expect(ReactDOM.findDOMNode(this.component).className.indexOf('collapsed') >= 0).toBe(false);
    });
  });

  xdescribe('when the message contains attachments', function() {
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
      this.message.body = `\
<img alt="A" src="cid:${file_inline.contentId}"/>
<img alt="B" src="cid:${file_inline_downloading.contentId}"/>
<img alt="C" src="cid:${file_inline_not_downloaded.contentId}"/>
<img src="cid:missing-attachment"/>\
`;
      this.createComponent();
    });

    it('should include the attachments area', function() {
      const attachments = ReactTestUtils.findRenderedDOMComponentWithClass(
        this.component,
        'attachments-area'
      );
      expect(attachments).toBeDefined();
    });

    it('injects a MessageAttachments component for any present attachments', function() {
      const els = ReactTestUtils.scryRenderedComponentsWithTypeAndProps(
        this.component,
        InjectedComponent,
        { matching: { role: 'MessageAttachments' } }
      );
      expect(els.length).toBe(1);
    });

    it('should list attachments that are not mentioned in the body via cid', function() {
      const els = ReactTestUtils.scryRenderedComponentsWithTypeAndProps(
        this.component,
        InjectedComponent,
        { matching: { role: 'MessageAttachments' } }
      );
      const attachments = els[0].props.exposedProps.files;
      expect(attachments.length).toEqual(5);
      expect(attachments[0]).toBe(file);
      expect(attachments[1]).toBe(file_not_downloaded);
      expect(attachments[2]).toBe(file_cid_but_not_referenced);
      expect(attachments[3]).toBe(file_cid_but_not_referenced_or_image);
    });

    it('should provide the correct file download state for each attachment', function() {
      const els = ReactTestUtils.scryRenderedComponentsWithTypeAndProps(
        this.component,
        InjectedComponent,
        { matching: { role: 'MessageAttachments' } }
      );
      const { downloads } = els[0].props.exposedProps;
      expect(downloads['file_1_id']).toBe(download);
      expect(downloads['file_not_downloaded']).toBe(undefined);
    });

    it('should still list attachments when the message has no body', function() {
      this.message.body = '';
      this.createComponent();
      const els = ReactTestUtils.scryRenderedComponentsWithTypeAndProps(
        this.component,
        InjectedComponent,
        { matching: { role: 'MessageAttachments' } }
      );
      const attachments = els[0].props.exposedProps.files;
      expect(attachments.length).toEqual(8);
    });
  });
});
