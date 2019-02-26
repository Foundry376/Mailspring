import React from 'react';
const proxyquire = require('proxyquire').noPreserveCache();
import ReactTestUtils from 'react-dom/test-utils';

const { Thread, Message, ComponentRegistry, DraftStore } = require('mailspring-exports');

class StubMessageItem extends React.Component {
  static displayName = 'StubMessageItem';
  render() {
    return <span />;
  }
}

class StubComposer extends React.Component {
  static displayName = 'StubComposer';
  render() {
    return <span />;
  }
}

const MessageItemContainer = proxyquire('../lib/message-item-container', {
  './message-item': StubMessageItem,
});

const testThread = new Thread({ id: 't1', accountId: TEST_ACCOUNT_ID });
const testClientId = 'local-id';
const testMessage = new Message({
  id: 'm1',
  draft: false,
  unread: true,
  accountId: TEST_ACCOUNT_ID,
});
const testDraft = new Message({ id: 'd1', draft: true, unread: true, accountId: TEST_ACCOUNT_ID });

xdescribe('MessageItemContainer', function() {
  beforeEach(function() {
    this.isSendingDraft = false;
    spyOn(DraftStore, 'isSendingDraft').andCallFake(() => this.isSendingDraft);
    return ComponentRegistry.register(StubComposer, { role: 'Composer' });
  });

  afterEach(() => ComponentRegistry.register(StubComposer, { role: 'Composer' }));

  const renderContainer = message =>
    ReactTestUtils.renderIntoDocument(
      <MessageItemContainer thread={testThread} message={message} headerMessageId={testClientId} />
    );

  it("shows composer if it's a draft", function() {
    this.isSendingDraft = false;
    const doc = renderContainer(testDraft);
    const items = ReactTestUtils.scryRenderedComponentsWithType(doc, StubComposer);
    return expect(items.length).toBe(1);
  });

  it("renders a message if it's a draft that is sending", function() {
    this.isSendingDraft = true;
    const doc = renderContainer(testDraft);
    const items = ReactTestUtils.scryRenderedComponentsWithType(doc, StubMessageItem);
    expect(items.length).toBe(1);
    return expect(items[0].props.pending).toBe(true);
  });

  return it("renders a message if it's not a draft", function() {
    this.isSendingDraft = false;
    const doc = renderContainer(testMessage);
    const items = ReactTestUtils.scryRenderedComponentsWithType(doc, StubMessageItem);
    return expect(items.length).toBe(1);
  });
});
