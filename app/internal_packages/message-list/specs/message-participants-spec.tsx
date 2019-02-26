const React = require('react');
const ReactDOM = require('react-dom');
const ReactTestUtils = require('react-dom/test-utils');
const { Message } = require('mailspring-exports');
const MessageParticipants = require('../lib/message-participants').default;

const user_1 = {
  name: 'User One',
  email: 'user1@nylas.com',
};
const user_2 = {
  name: 'User Two',
  email: 'user2@nylas.com',
};
const user_3 = {
  name: 'User Three',
  email: 'user3@nylas.com',
};
const user_4 = {
  name: 'User Four',
  email: 'user4@nylas.com',
};
const user_5 = {
  name: 'User Five',
  email: 'user5@nylas.com',
};

const test_message = new Message().fromJSON({
  id: '111',
  from: [user_1],
  to: [user_2],
  cc: [user_3, user_4],
  bcc: [user_5],
});

describe('MessageParticipants', function() {
  describe('when collapsed', function() {
    const makeParticipants = props =>
      ReactTestUtils.renderIntoDocument(<MessageParticipants {...props} />);

    it('renders into the document', function() {
      const participants = makeParticipants(
        { to: test_message.to, cc: test_message.cc },
        { from: test_message.from, message_participants: test_message.participants() }
      );
      expect(participants).toBeDefined();
    });

    it('uses short names', function() {
      const actualOut = makeParticipants({ to: test_message.to });
      const to = ReactTestUtils.findRenderedDOMComponentWithClass(actualOut, 'to-contact');
      expect(ReactDOM.findDOMNode(to).innerHTML).toBe('User');
    });

    it("doesn't render any To nodes if To array is empty", function() {
      const actualOut = makeParticipants({ to: [] });
      const findToField = () =>
        ReactTestUtils.findRenderedDOMComponentWithClass(actualOut, 'to-contact');
      expect(findToField).toThrow();
    });

    it("doesn't render any Cc nodes if Cc array is empty", function() {
      const actualOut = makeParticipants({ cc: [] });
      const findCcField = () =>
        ReactTestUtils.findRenderedDOMComponentWithClass(actualOut, 'cc-contact');
      expect(findCcField).toThrow();
    });

    it("doesn't render any Bcc nodes if Bcc array is empty", function() {
      const actualOut = makeParticipants({ bcc: [] });
      const findBccField = () =>
        ReactTestUtils.findRenderedDOMComponentWithClass(actualOut, 'bcc-contact');
      expect(findBccField).toThrow();
    });
  });

  describe('when expanded', function() {
    beforeEach(function() {
      this.participants = ReactTestUtils.renderIntoDocument(
        <MessageParticipants
          to={test_message.to}
          cc={test_message.cc}
          from={test_message.from}
          replyTo={test_message.replyTo}
          isDetailed={true}
          message_participants={test_message.participants()}
        />
      );
    });

    it('renders into the document', function() {
      const participants = ReactTestUtils.findRenderedDOMComponentWithClass(
        this.participants,
        'expanded-participants'
      );
      expect(participants).toBeDefined();
    });

    it('uses full names', function() {
      const to = ReactTestUtils.findRenderedDOMComponentWithClass(this.participants, 'to-contact');
      expect(ReactDOM.findDOMNode(to).innerText.trim()).toEqual('User Two <user2@nylas.com>');
    });
  });
});

// TODO: We no longer display "to everyone"
//
// it "determines the message is to everyone", ->
//   p1 = TestUtils.renderIntoDocument(
//     <MessageParticipants to={big_test_message.to}
//                          cc={big_test_message.cc}
//                          from={big_test_message.from}
//                          message_participants={big_test_message.participants()} />
//   )
//   expect(p1._isToEveryone()).toBe true
//
// it "knows when the message isn't to everyone due to participant mismatch", ->
//   p2 = TestUtils.renderIntoDocument(
//     <MessageParticipants to={test_message.to}
//                          cc={test_message.cc}
//                          from={test_message.from}
//                          message_participants={test_message.participants()} />
//   )
//   # this should be false because we don't count bccs
//   expect(p2._isToEveryone()).toBe false
//
// it "knows when the message isn't to everyone due to participant size", ->
//   p2 = TestUtils.renderIntoDocument(
//     <MessageParticipants to={test_message.to}
//                          cc={test_message.cc}
//                          from={test_message.from}
//                          message_participants={test_message.participants()} />
//   )
//   # this should be false because we don't count bccs
//   expect(p2._isToEveryone()).toBe false
