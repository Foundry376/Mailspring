import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';

import _ from 'underscore';
const { AccountStore, Thread, Contact, Message } = require('mailspring-exports');
const ThreadListParticipants = require('../lib/thread-list-participants');

describe('ThreadListParticipants', function() {
  beforeEach(function() {
    this.account = AccountStore.accounts()[0];
  });

  it('renders unread contacts with .unread-true', function() {
    const ben = new Contact({ email: 'ben@nylas.com', name: 'ben' });
    ben.unread = true;
    const thread = new Thread();
    thread.__messages = [new Message({ from: [ben], unread: true })];

    this.participants = ReactTestUtils.renderIntoDocument(
      <ThreadListParticipants thread={thread} />
    );
    const unread = ReactTestUtils.scryRenderedDOMComponentsWithClass(
      this.participants,
      'unread-true'
    );
    expect(unread.length).toBe(1);
  });

  describe('getTokens', function() {
    beforeEach(function() {
      this.ben = new Contact({ email: 'ben@nylas.com', name: 'ben' });
      this.evan = new Contact({ email: 'evan@nylas.com', name: 'evan' });
      this.evanAgain = new Contact({ email: 'evan@nylas.com', name: 'evan' });
      this.michael = new Contact({ email: 'michael@nylas.com', name: 'michael' });
      this.kavya = new Contact({ email: 'kavya@nylas.com', name: 'kavya' });
      this.phab1 = new Contact({ email: 'no-reply@phab.nylas.com', name: 'Ben' });
      this.phab2 = new Contact({ email: 'no-reply@phab.nylas.com', name: 'MG' });
    });

    describe('when thread.messages is available', () =>
      it('correctly produces items for display in a wide range of scenarios', function() {
        const scenarios = [
          {
            name: 'single read email',
            in: [new Message({ unread: false, from: [this.ben] })],
            out: [{ contact: this.ben, unread: false }],
          },
          {
            name: 'single read email and draft',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ from: [this.ben], draft: true }),
            ],
            out: [{ contact: this.ben, unread: false }],
          },
          {
            name: 'single unread email',
            in: [new Message({ unread: true, from: [this.evan] })],
            out: [{ contact: this.evan, unread: true }],
          },
          {
            name: 'single unread response',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evan] }),
            ],
            out: [{ contact: this.ben, unread: false }, { contact: this.evan, unread: true }],
          },
          {
            name: 'two unread responses',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evan] }),
              new Message({ unread: true, from: [this.kavya] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { contact: this.evan, unread: true },
              { contact: this.kavya, unread: true },
            ],
          },
          {
            name: 'two unread responses (repeated participants)',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evan] }),
              new Message({ unread: true, from: [this.evanAgain] }),
            ],
            out: [{ contact: this.ben, unread: false }, { contact: this.evan, unread: true }],
          },
          {
            name: 'three unread responses (repeated participants)',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evan] }),
              new Message({ unread: true, from: [this.michael] }),
              new Message({ unread: true, from: [this.evanAgain] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { spacer: true },
              { contact: this.michael, unread: true },
              { contact: this.evanAgain, unread: true },
            ],
          },
          {
            name: 'three unread responses',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evan] }),
              new Message({ unread: true, from: [this.michael] }),
              new Message({ unread: true, from: [this.kavya] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { spacer: true },
              { contact: this.michael, unread: true },
              { contact: this.kavya, unread: true },
            ],
          },
          {
            name: 'ends with two emails from the same person, second one is unread',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: false, from: [this.evan] }),
              new Message({ unread: false, from: [this.kavya] }),
              new Message({ unread: true, from: [this.kavya] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { contact: this.evan, unread: false },
              { contact: this.kavya, unread: true },
            ],
          },
          {
            name: 'three unread responses to long thread',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: false, from: [this.evan] }),
              new Message({ unread: false, from: [this.michael] }),
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evanAgain] }),
              new Message({ unread: true, from: [this.michael] }),
              new Message({ unread: true, from: [this.evanAgain] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { spacer: true },
              { contact: this.michael, unread: true },
              { contact: this.evanAgain, unread: true },
            ],
          },
          {
            name: 'single unread responses to long thread',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: false, from: [this.evan] }),
              new Message({ unread: false, from: [this.michael] }),
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: true, from: [this.evanAgain] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { spacer: true },
              { contact: this.ben, unread: false },
              { contact: this.evanAgain, unread: true },
            ],
          },
          {
            name: 'long read thread',
            in: [
              new Message({ unread: false, from: [this.ben] }),
              new Message({ unread: false, from: [this.evan] }),
              new Message({ unread: false, from: [this.michael] }),
              new Message({ unread: false, from: [this.ben] }),
            ],
            out: [
              { contact: this.ben, unread: false },
              { spacer: true },
              { contact: this.michael, unread: false },
              { contact: this.ben, unread: false },
            ],
          },
          {
            name: 'thread with different participants with the same email address',
            in: [
              new Message({ unread: false, from: [this.phab1] }),
              new Message({ unread: false, from: [this.phab2] }),
            ],
            out: [{ contact: this.phab1, unread: false }, { contact: this.phab2, unread: false }],
          },
        ];

        for (let scenario of scenarios) {
          const thread = new Thread();
          thread.__messages = scenario.in;
          const participants = ReactTestUtils.renderIntoDocument(
            <ThreadListParticipants thread={thread} />
          );

          expect(participants.getTokens()).toEqual(scenario.out);

          // Slightly misuse jasmine to get the output we want to show
          if (!_.isEqual(participants.getTokens(), scenario.out)) {
            expect(scenario.name).toBe('correct');
          }
        }
      }));

    describe('when getTokens() called and current user is only sender', function() {
      beforeEach(function() {
        this.me = this.account.me();
        this.ben = new Contact({ email: 'ben@nylas.com', name: 'ben' });
        this.evan = new Contact({ email: 'evan@nylas.com', name: 'evan' });
        this.evanCapitalized = new Contact({ email: 'EVAN@nylas.com', name: 'evan' });
        this.michael = new Contact({ email: 'michael@nylas.com', name: 'michael' });
        this.kavya = new Contact({ email: 'kavya@nylas.com', name: 'kavya' });
      });

      const getTokens = function(threadMessages) {
        const thread = new Thread();
        thread.__messages = threadMessages;
        const participants = ReactTestUtils.renderIntoDocument(
          <ThreadListParticipants thread={thread} />
        );
        return participants.getTokens();
      };

      it('shows only recipients for emails sent from me to different recipients', function() {
        const input = [
          new Message({ unread: false, from: [this.me], to: [this.ben] }),
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.ben] }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [
          { contact: this.ben, unread: false },
          { contact: this.evan, unread: false },
          { contact: this.ben, unread: false },
        ];
        expect(actualOut).toEqual(expectedOut);
      });

      it('is case insensitive', function() {
        const input = [
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.evanCapitalized] }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [{ contact: this.evan, unread: false }];
        expect(actualOut).toEqual(expectedOut);
      });

      it('shows only first, spacer, second to last, and last recipients if recipients count > 3', function() {
        const input = [
          new Message({ unread: false, from: [this.me], to: [this.ben] }),
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.michael] }),
          new Message({ unread: false, from: [this.me], to: [this.kavya] }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [
          { contact: this.ben, unread: false },
          { spacer: true },
          { contact: this.michael, unread: false },
          { contact: this.kavya, unread: false },
        ];
        expect(actualOut).toEqual(expectedOut);
      });

      it('shows correct recipients even if only one email', function() {
        const input = [
          new Message({
            unread: false,
            from: [this.me],
            to: [this.ben, this.evan, this.michael, this.kavya],
          }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [
          { contact: this.ben, unread: false },
          { spacer: true },
          { contact: this.michael, unread: false },
          { contact: this.kavya, unread: false },
        ];
        expect(actualOut).toEqual(expectedOut);
      });

      it('shows only one recipient if the sender only sent to one recipient', function() {
        const input = [
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [{ contact: this.evan, unread: false }];
        expect(actualOut).toEqual(expectedOut);
      });

      it('shows only the recipient for one sent email', function() {
        const input = [new Message({ unread: false, from: [this.me], to: [this.evan] })];
        const actualOut = getTokens(input);
        const expectedOut = [{ contact: this.evan, unread: false }];
        expect(actualOut).toEqual(expectedOut);
      });

      it('shows unread email as well', function() {
        const input = [
          new Message({ unread: false, from: [this.me], to: [this.evan] }),
          new Message({ unread: false, from: [this.me], to: [this.ben] }),
          new Message({ unread: true, from: [this.me], to: [this.kavya] }),
          new Message({ unread: true, from: [this.me], to: [this.michael] }),
        ];
        const actualOut = getTokens(input);
        const expectedOut = [
          { contact: this.evan, unread: false },
          { spacer: true },
          { contact: this.kavya, unread: true },
          { contact: this.michael, unread: true },
        ];
        expect(actualOut).toEqual(expectedOut);
      });
    });
  });
});
