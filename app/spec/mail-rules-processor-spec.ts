import {
  Message,
  Contact,
  Thread,
  File,
  DatabaseStore,
  TaskQueue,
  Actions,
} from 'mailspring-exports';

const MailRulesProcessor = require('../src/mail-rules-processor');

const Tests = [
  {
    rule: {
      id: 'local-ac7f1671-ba03',
      name: 'conditionMode Any, contains, equals',
      conditions: [
        {
          templateKey: 'from',
          comparatorKey: 'contains',
          value: '@mailspring.com',
        },
        {
          templateKey: 'from',
          comparatorKey: 'equals',
          value: 'oldschool@nilas.com',
        },
      ],
      conditionMode: 'any',
      actions: [
        {
          templateKey: 'markAsRead',
        },
      ],
      accountId: 'b5djvgcuhj6i3x8nm53d0vnjm',
    },
    good: [
      new Message({ from: [new Contact({ email: 'ben@mailspring.com' })] }),
      new Message({ from: [new Contact({ email: 'ben@mailspring.com.jp' })] }),
      new Message({ from: [new Contact({ email: 'oldschool@nilas.com' })] }),
    ],
    bad: [
      new Message({ from: [new Contact({ email: 'ben@other.com' })] }),
      new Message({ from: [new Contact({ email: 'ben@nilas.com' })] }),
      new Message({ from: [new Contact({ email: 'twooldschool@nilas.com' })] }),
    ],
  },
  {
    rule: {
      id: 'local-ac7f1671-ba03',
      name: 'conditionMode all, ends with, begins with',
      conditions: [
        {
          templateKey: 'cc',
          comparatorKey: 'endsWith',
          value: '.com',
        },
        {
          templateKey: 'subject',
          comparatorKey: 'beginsWith',
          value: '[TEST] ',
        },
      ],
      conditionMode: 'any',
      actions: [
        {
          templateKey: 'applyLabel',
          value: '51a0hb8d6l78mmhy19ffx4txs',
        },
      ],
      accountId: 'b5djvgcuhj6i3x8nm53d0vnjm',
    },
    good: [
      new Message({ cc: [new Contact({ email: 'ben@mailspring.org' })], subject: '[TEST] ABCD' }),
      new Message({ cc: [new Contact({ email: 'ben@mailspring.org' })], subject: '[test] ABCD' }),
      new Message({ cc: [new Contact({ email: 'ben@mailspring.com' })], subject: 'Whatever' }),
      new Message({ cc: [new Contact({ email: 'a@test.com' })], subject: 'Whatever' }),
      new Message({ cc: [new Contact({ email: 'a@hasacom.com' })], subject: '[test] Whatever' }),
      new Message({
        cc: [new Contact({ email: 'a@hasacom.org' }), new Contact({ email: 'b@mailspring.com' })],
        subject: 'Whatever',
      }),
    ],
    bad: [
      new Message({ cc: [new Contact({ email: 'a@hasacom.org' })], subject: 'Whatever' }),
      new Message({ cc: [new Contact({ email: 'a@hasacom.org' })], subject: '[test]Whatever' }),
      new Message({
        cc: [new Contact({ email: 'a.com@hasacom.org' })],
        subject: 'Whatever [test] ',
      }),
    ],
  },
  {
    rule: {
      id: 'local-ac7f1671-ba03',
      name: 'Any attachment name endsWith, anyRecipient equals',
      conditions: [
        {
          templateKey: 'anyAttachmentName',
          comparatorKey: 'endsWith',
          value: '.pdf',
        },
        {
          templateKey: 'anyRecipient',
          comparatorKey: 'equals',
          value: 'files@mailspring.com',
        },
      ],
      conditionMode: 'any',
      actions: [
        {
          templateKey: 'changeFolder',
          value: '51a0hb8d6l78mmhy19ffx4txs',
        },
      ],
      accountId: 'b5djvgcuhj6i3x8nm53d0vnjm',
    },
    good: [
      new Message({
        files: [new File({ filename: 'bengotow.pdf' })],
        to: [new Contact({ email: 'ben@mailspring.org' })],
      }),
      new Message({ to: [new Contact({ email: 'files@mailspring.com' })] }),
      new Message({
        to: [new Contact({ email: 'ben@mailspring.com' })],
        cc: [new Contact({ email: 'ben@test.com' }), new Contact({ email: 'files@mailspring.com' })],
      }),
    ],
    bad: [
      new Message({ to: [new Contact({ email: 'ben@mailspring.org' })] }),
      new Message({
        files: [new File({ filename: 'bengotow.pdfz' })],
        to: [new Contact({ email: 'ben@mailspring.org' })],
      }),
      new Message({
        files: [new File({ filename: 'bengotowpdf' })],
        to: [new Contact({ email: 'ben@mailspring.org' })],
      }),
      new Message({ to: [new Contact({ email: 'afiles@mailspring.com' })] }),
      new Message({ to: [new Contact({ email: 'files@mailspring.coma' })] }),
    ],
  },
];

xdescribe('MailRulesProcessor', function() {
  describe('_checkRuleForMessage', function() {
    it('should correctly filter sample messages', () =>
      Tests.forEach(({ rule, good, bad }) => {
        let idx, message;
        for (idx = 0; idx < good.length; idx++) {
          message = good[idx];
          message.accountId = rule.accountId;
          if (MailRulesProcessor._checkRuleForMessage(rule, message) !== true) {
            expect(`${idx} (${rule.name})`).toBe(true);
          }
        }
        return (() => {
          const result = [];
          for (idx = 0; idx < bad.length; idx++) {
            message = bad[idx];
            message.accountId = rule.accountId;
            if (MailRulesProcessor._checkRuleForMessage(rule, message) !== false) {
              result.push(expect(`${idx} (${rule.name})`).toBe(false));
            } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      }));

    it('should check the account id', function() {
      const { rule, good } = Tests[0];
      const message = good[0];
      message.accountId = 'not the same!';
      expect(MailRulesProcessor._checkRuleForMessage(rule, message)).toBe(false);
    });
  });

  describe('_applyRuleToMessage', () =>
    it('should queue tasks for messages', function() {
      spyOn(TaskQueue, 'waitForPerformLocal');
      spyOn(Actions, 'queueTask');
      spyOn(DatabaseStore, 'findBy').andReturn(Promise.resolve({}));
      Tests.forEach(({ rule }) => {
        TaskQueue.waitForPerformLocal.reset();
        Actions.queueTask.reset();

        const message = new Message({ accountId: rule.accountId });
        const thread = new Thread({ accountId: rule.accountId });
        const response = MailRulesProcessor._applyRuleToMessage(rule, message, thread);
        expect(response instanceof Promise).toBe(true);

        waitsForPromise(() => {
          return response.then(() => {
            expect(TaskQueue.waitForPerformLocal).toHaveBeenCalled();
            expect(Actions.queueTask).toHaveBeenCalled();
          });
        });
      });
    }));
});
