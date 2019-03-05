// const moment = require('moment');
// import _ from 'underscore';
// import React from 'react';
// let ReactTestUtils = require('react-dom/test-utils');
// ReactTestUtils = _.extend(ReactTestUtils, require('jasmine-react-helpers'));

// const {
//   Thread,
//   Actions,
//   Account,
//   DatabaseStore,
//   WorkspaceStore,
//   MailspringTestUtils,
//   AccountStore,
//   ComponentRegistry,
// } = require('mailspring-exports');
// import { ListTabular } from 'mailspring-component-kit';;

// const ThreadStore = require('../lib/thread-store');
// const ThreadList = require('../lib/thread-list');

// const test_threads = () => [
//   new Thread().fromJSON({
//     id: '111',
//     object: 'thread',
//     created_at: null,
//     updated_at: null,
//     account_id: TEST_ACCOUNT_ID,
//     snippet: 'snippet 111',
//     subject: 'Subject 111',
//     tags: [
//       {
//         id: 'unseen',
//         created_at: null,
//         updated_at: null,
//         name: 'unseen',
//       },
//       {
//         id: 'all',
//         created_at: null,
//         updated_at: null,
//         name: 'all',
//       },
//       {
//         id: 'inbox',
//         created_at: null,
//         updated_at: null,
//         name: 'inbox',
//       },
//       {
//         id: 'unread',
//         created_at: null,
//         updated_at: null,
//         name: 'unread',
//       },
//       {
//         id: 'attachment',
//         created_at: null,
//         updated_at: null,
//         name: 'attachment',
//       },
//     ],
//     participants: [
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User One',
//         email: 'user1@nylas.com',
//       },
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User Two',
//         email: 'user2@nylas.com',
//       },
//     ],
//     lastMessageReceivedTimestamp: 1415742036,
//   }),
//   new Thread().fromJSON({
//     id: '222',
//     object: 'thread',
//     created_at: null,
//     updated_at: null,
//     account_id: TEST_ACCOUNT_ID,
//     snippet: 'snippet 222',
//     subject: 'Subject 222',
//     tags: [
//       {
//         id: 'unread',
//         created_at: null,
//         updated_at: null,
//         name: 'unread',
//       },
//       {
//         id: 'all',
//         created_at: null,
//         updated_at: null,
//         name: 'all',
//       },
//       {
//         id: 'unseen',
//         created_at: null,
//         updated_at: null,
//         name: 'unseen',
//       },
//       {
//         id: 'inbox',
//         created_at: null,
//         updated_at: null,
//         name: 'inbox',
//       },
//     ],
//     participants: [
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User One',
//         email: 'user1@nylas.com',
//       },
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User Three',
//         email: 'user3@nylas.com',
//       },
//     ],
//     lastMessageReceivedTimestamp: 1415741913,
//   }),
//   new Thread().fromJSON({
//     id: '333',
//     object: 'thread',
//     created_at: null,
//     updated_at: null,
//     account_id: TEST_ACCOUNT_ID,
//     snippet: 'snippet 333',
//     subject: 'Subject 333',
//     tags: [
//       {
//         id: 'inbox',
//         created_at: null,
//         updated_at: null,
//         name: 'inbox',
//       },
//       {
//         id: 'all',
//         created_at: null,
//         updated_at: null,
//         name: 'all',
//       },
//       {
//         id: 'unseen',
//         created_at: null,
//         updated_at: null,
//         name: 'unseen',
//       },
//     ],
//     participants: [
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User One',
//         email: 'user1@nylas.com',
//       },
//       {
//         created_at: null,
//         updated_at: null,
//         name: 'User Four',
//         email: 'user4@nylas.com',
//       },
//     ],
//     lastMessageReceivedTimestamp: 1415741837,
//   }),
// ];

// const cjsxSubjectResolver = thread => (
//   <div>
//     <span>Subject {thread.id}</span>
//     <span className="snippet">Snippet</span>
//   </div>
// );

// describe('ThreadList', function() {
//   class Foo extends React.Component {
//     render() {
//       return <div>{this.props.children}</div>;
//     }
//   }

//   const c1 = new ListTabular.Column({
//     name: 'Name',
//     flex: 1,
//     resolver(thread) {
//       return `${thread.id} Test Name`;
//     },
//   });
//   const c2 = new ListTabular.Column({
//     name: 'Subject',
//     flex: 3,
//     resolver: cjsxSubjectResolver,
//   });
//   const c3 = new ListTabular.Column({
//     name: 'Date',
//     resolver(thread) {
//       return <Foo>{thread.id}</Foo>;
//     },
//   });

//   const columns = [c1, c2, c3];

//   beforeEach(function() {
//     MailspringTestUtils.loadKeymap('internal_packages/thread-list/keymaps/thread-list');
//     spyOn(ThreadStore, '_onAccountChanged');
//     spyOn(DatabaseStore, 'findAll').andCallFake(
//       () =>
//         new Promise(function(resolve, reject) {
//           return resolve(test_threads());
//         })
//     );
//     ReactTestUtils.spyOnClass(ThreadList, '_prepareColumns').andCallFake(function() {
//       return (this._columns = columns);
//     });

//     ThreadStore._resetInstanceVars();

//     this.thread_list = ReactTestUtils.renderIntoDocument(<ThreadList />);
//   });

//   it('renders into the document', function() {
//     expect(ReactTestUtils.isCompositeComponentWithType(this.thread_list, ThreadList)).toBe(true);
//   });

//   it('has the expected columns', function() {
//     expect(this.thread_list._columns).toEqual(columns);
//   });

//   it('by default has zero children', function() {
//     const items = ReactTestUtils.scryRenderedComponentsWithType(this.thread_list, ListTabular.Item);
//     expect(items.length).toBe(0);
//   });

//   describe('when the workspace is in list mode', function() {
//     beforeEach(function() {
//       spyOn(WorkspaceStore, 'layoutMode').andReturn('list');
//       this.thread_list.setState({ focusedId: 't111' });
//     });

//     it("allows reply only when the sheet type is 'Thread'", function() {
//       spyOn(WorkspaceStore, 'sheet').andCallFake(() => ({ type: 'Thread' }));
//       spyOn(Actions, 'composeReply');
//       this.thread_list._onReply();
//       expect(Actions.composeReply).toHaveBeenCalled();
//       expect(this.thread_list._actionInVisualScope()).toBe(true);
//     });

//     it("doesn't reply only when the sheet type isnt 'Thread'", function() {
//       spyOn(WorkspaceStore, 'sheet').andCallFake(() => ({ type: 'Root' }));
//       spyOn(Actions, 'composeReply');
//       this.thread_list._onReply();
//       expect(Actions.composeReply).not.toHaveBeenCalled();
//       expect(this.thread_list._actionInVisualScope()).toBe(false);
//     });
//   });

//   describe('when the workspace is in split mode', function() {
//     beforeEach(function() {
//       spyOn(WorkspaceStore, 'layoutMode').andReturn('split');
//       this.thread_list.setState({ focusedId: 't111' });
//     });

//     it('allows reply and reply-all regardless of sheet type', function() {
//       spyOn(WorkspaceStore, 'sheet').andCallFake(() => ({ type: 'anything' }));
//       spyOn(Actions, 'composeReply');
//       this.thread_list._onReply();
//       expect(Actions.composeReply).toHaveBeenCalled();
//       expect(this.thread_list._actionInVisualScope()).toBe(true);
//     });
//   });

//   describe('Populated thread list', function() {
//     beforeEach(function() {
//       const view = {
//         loaded() {
//           return true;
//         },
//         get(i) {
//           return test_threads()[i];
//         },
//         count() {
//           return test_threads().length;
//         },
//         setRetainedRange() {},
//       };
//       ThreadStore._view = view;
//       ThreadStore._focusedId = null;
//       ThreadStore.trigger(ThreadStore);
//       this.thread_list_node = ReactDOM.findDOMNode(this.thread_list);
//       spyOn(this.thread_list, 'setState').andCallThrough();
//     });

//     it('renders all of the thread list items', function() {
//       advanceClock(100);
//       const items = ReactTestUtils.scryRenderedComponentsWithType(
//         this.thread_list,
//         ListTabular.Item
//       );
//       expect(items.length).toBe(test_threads().length);
//     });
//   });
// });
