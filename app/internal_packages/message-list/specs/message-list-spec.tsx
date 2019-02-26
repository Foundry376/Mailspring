const React = require('react');
const ReactDOM = require('react-dom');
const ReactTestUtils = require('react-dom/test-utils');

const {
  Thread,
  Contact,
  Folder,
  Message,
  MessageStore,
  MailspringTestUtils,
} = require('mailspring-exports');

const MessageParticipants = require('../lib/message-participants').default;
const MessageItemContainer = require('../lib/message-item-container').default;
const MessageList = require('../lib/message-list').default;

// User_1 needs to be "me" so that when we calculate who we should reply
// to, it properly matches the AccountStore
const user_1 = new Contact({
  accountId: TEST_ACCOUNT_ID,
  name: TEST_ACCOUNT_NAME,
  email: TEST_ACCOUNT_EMAIL,
});
const user_2 = new Contact({
  accountId: TEST_ACCOUNT_ID,
  name: 'User Two',
  email: 'user2@nylas.com',
});
const user_3 = new Contact({
  accountId: TEST_ACCOUNT_ID,
  name: 'User Three',
  email: 'user3@nylas.com',
});
const user_4 = new Contact({
  accountId: TEST_ACCOUNT_ID,
  name: 'User Four',
  email: 'user4@nylas.com',
});
const user_5 = new Contact({
  accountId: TEST_ACCOUNT_ID,
  name: 'User Five',
  email: 'user5@nylas.com',
});

const m1 = new Message({
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
  folder: new Folder({ role: 'all', name: 'All Mail' }),
});
const m2 = new Message({
  id: '222',
  from: [user_2],
  to: [user_1],
  cc: [user_3, user_4],
  bcc: null,
  body: 'Body Two',
  date: new Date(1415814587),
  draft: false,
  files: [],
  unread: false,
  snippet: 'snippet Two...',
  subject: 'Subject Two',
  threadId: 'thread_12345',
  accountId: TEST_ACCOUNT_ID,
  folder: new Folder({ role: 'all', name: 'All Mail' }),
});
const m3 = new Message({
  id: '333',
  from: [user_3],
  to: [user_1],
  cc: [user_2, user_4],
  bcc: [],
  body: 'Body Three',
  date: new Date(1415814587),
  draft: false,
  files: [],
  unread: false,
  snippet: 'snippet Three...',
  subject: 'Subject Three',
  threadId: 'thread_12345',
  accountId: TEST_ACCOUNT_ID,
  folder: new Folder({ role: 'all', name: 'All Mail' }),
});
const m4 = new Message({
  id: '444',
  from: [user_4],
  to: [user_1],
  cc: [],
  bcc: [user_5],
  body: 'Body Four',
  date: new Date(1415814587),
  draft: false,
  files: [],
  unread: false,
  snippet: 'snippet Four...',
  subject: 'Subject Four',
  threadId: 'thread_12345',
  accountId: TEST_ACCOUNT_ID,
  folder: new Folder({ role: 'all', name: 'All Mail' }),
});
const m5 = new Message({
  id: '555',
  from: [user_1],
  to: [user_4],
  cc: [],
  bcc: [],
  body: 'Body Five',
  date: new Date(1415814587),
  draft: false,
  files: [],
  unread: false,
  snippet: 'snippet Five...',
  subject: 'Subject Five',
  threadId: 'thread_12345',
  accountId: TEST_ACCOUNT_ID,
  folder: new Folder({ role: 'all', name: 'All Mail' }),
});
const testMessages = [m1, m2, m3, m4, m5];
const draftMessages = [
  new Message({
    id: '666',
    headerMessageId: 'asdasd-asd@mbbp.local',
    from: [user_1],
    to: [],
    cc: [],
    bcc: null,
    body: 'Body One',
    date: new Date(1415814587),
    draft: true,
    files: [],
    unread: false,
    snippet: 'draft snippet one...',
    subject: 'Draft One',
    threadId: 'thread_12345',
    accountId: TEST_ACCOUNT_ID,
    folder: new Folder({ role: 'all', name: 'All Mail' }),
  }),
];

const testThread = new Thread({
  id: 'thread_12345',
  subject: 'Subject 12345',
  accountId: TEST_ACCOUNT_ID,
});

describe('MessageList', function() {
  beforeEach(function() {
    MessageStore._items = [];
    MessageStore._threadId = null;
    spyOn(MessageStore, 'itemsLoading').andCallFake(() => false);

    this.messageList = ReactTestUtils.renderIntoDocument(<MessageList />);
    this.messageList_node = ReactDOM.findDOMNode(this.messageList);
  });

  it('renders into the document', function() {
    expect(ReactTestUtils.isCompositeComponentWithType(this.messageList, MessageList)).toBe(true);
  });

  it('by default has zero children', function() {
    const items = ReactTestUtils.scryRenderedComponentsWithType(
      this.messageList,
      MessageItemContainer
    );

    expect(items.length).toBe(0);
  });

  describe('Populated Message list', function() {
    beforeEach(function() {
      MessageStore._items = testMessages;
      MessageStore._expandItemsToDefault();
      MessageStore.trigger(MessageStore);
      this.messageList.setState({ currentThread: testThread });
      MailspringTestUtils.loadKeymap('keymaps/base');
    });

    it('renders all the correct number of messages', function() {
      const items = ReactTestUtils.scryRenderedComponentsWithType(
        this.messageList,
        MessageItemContainer
      );
      expect(items.length).toBe(5);
    });

    it('renders the correct number of expanded messages', function() {
      const msgs = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.messageList,
        'collapsed message-item-wrap'
      );
      expect(msgs.length).toBe(4);
    });

    it('displays lists of participants on the page', function() {
      const items = ReactTestUtils.scryRenderedComponentsWithType(
        this.messageList,
        MessageParticipants
      );
      expect(items.length).toBe(2);
    });

    it('includes drafts as message item containers', function() {
      const msgs = this.messageList.state.messages;
      this.messageList.setState({
        messages: msgs.concat(draftMessages),
      });
      const items = ReactTestUtils.scryRenderedComponentsWithType(
        this.messageList,
        MessageItemContainer
      );
      expect(items.length).toBe(6);
    });
  });

  describe('reply type', function() {
    it("prompts for a reply when there's only one participant", function() {
      MessageStore._items = [m3, m5];
      MessageStore._thread = testThread;
      MessageStore.trigger();
      expect(this.messageList._replyType()).toBe('reply');
      const cs = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.messageList,
        'footer-reply-area'
      );
      expect(cs.length).toBe(1);
    });

    it("prompts for a reply-all when there's more than one participant and the default is reply-all", function() {
      spyOn(AppEnv.config, 'get').andReturn('reply-all');
      MessageStore._items = [m5, m3];
      MessageStore._thread = testThread;
      MessageStore.trigger();
      expect(this.messageList._replyType()).toBe('reply-all');
      const cs = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.messageList,
        'footer-reply-area'
      );
      expect(cs.length).toBe(1);
    });

    it("prompts for a reply-all when there's more than one participant and the default is reply", function() {
      spyOn(AppEnv.config, 'get').andReturn('reply');
      MessageStore._items = [m5, m3];
      MessageStore._thread = testThread;
      MessageStore.trigger();
      expect(this.messageList._replyType()).toBe('reply');
      const cs = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.messageList,
        'footer-reply-area'
      );
      expect(cs.length).toBe(1);
    });

    it('hides the reply type if the last message is a draft', function() {
      MessageStore._items = [m5, m3, draftMessages[0]];
      MessageStore._thread = testThread;
      MessageStore.trigger();
      const cs = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.messageList,
        'footer-reply-area'
      );
      expect(cs.length).toBe(0);
    });
  });

  describe('Message minification', function() {
    beforeEach(function() {
      this.messageList.MINIFY_THRESHOLD = 3;
      this.messageList.setState({ minified: true });
      this.messages = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
      ];
    });

    it("ignores the first message if it's collapsed", function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: false,
          f: false,
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
        },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it("ignores the first message if it's expanded", function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: 'default',
          b: false,
          c: false,
          d: false,
          e: false,
          f: false,
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
        },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it("doesn't minify the last collapsed message", function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: false,
          f: 'default',
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }],
        },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it('allows explicitly expanded messages', function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: false,
          f: 'explicit',
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
        },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it("doesn't minify if the threshold isn't reached", function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: 'default',
          c: false,
          d: 'default',
          e: false,
          f: 'default',
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it("doesn't minify if the threshold isn't reached due to the rule about not minifying the last collapsed messages", function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: 'default',
          f: 'default',
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it('minifies at the threshold if the message is explicitly expanded', function() {
      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: 'explicit',
          f: 'default',
          g: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(this.messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }],
        },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
      ]);
    });

    it('can have multiple minification blocks', function() {
      const messages = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
        { id: 'h' },
        { id: 'i' },
        { id: 'j' },
        { id: 'k' },
        { id: 'l' },
      ];

      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: false,
          f: 'default',
          g: false,
          h: false,
          i: false,
          j: false,
          k: false,
          l: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }],
        },
        { id: 'e' },
        { id: 'f' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'g' }, { id: 'h' }, { id: 'i' }, { id: 'j' }],
        },
        { id: 'k' },
        { id: 'l' },
      ]);
    });

    it('can have multiple minification blocks next to explicitly expanded messages', function() {
      const messages = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
        { id: 'h' },
        { id: 'i' },
        { id: 'j' },
        { id: 'k' },
        { id: 'l' },
      ];

      this.messageList.setState({
        messagesExpandedState: {
          a: false,
          b: false,
          c: false,
          d: false,
          e: 'explicit',
          f: 'default',
          g: false,
          h: false,
          i: false,
          j: false,
          k: 'explicit',
          l: 'default',
        },
      });

      const out = this.messageList._messagesWithMinification(messages);
      expect(out).toEqual([
        { id: 'a' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'b' }, { id: 'c' }, { id: 'd' }],
        },
        { id: 'e' },
        { id: 'f' },
        {
          type: 'minifiedBundle',
          messages: [{ id: 'g' }, { id: 'h' }, { id: 'i' }, { id: 'j' }],
        },
        { id: 'k' },
        { id: 'l' },
      ]);
    });
  });
});
