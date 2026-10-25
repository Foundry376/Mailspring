import {
  SearchQueryParser,
  SearchQueryAST,
  Account,
  Folder,
  Label,
  DateUtils,
} from 'mailspring-exports';
import RemoteSearchQueryBackend from '../../../src/services/search/search-query-backend-remote';

const gmail = new Account({ id: 'a1', provider: 'gmail' });
const imap = new Account({ id: 'a2', provider: 'imap' });

const gmailCategories = [
  new Folder({ id: 'all', accountId: 'a1', role: 'all', path: '[Gmail]/All Mail' }),
  new Folder({ id: 'trash', accountId: 'a1', role: 'trash', path: '[Gmail]/Trash' }),
  new Folder({ id: 'spam', accountId: 'a1', role: 'spam', path: '[Gmail]/Spam' }),
  new Label({ id: 'inbox', accountId: 'a1', role: 'inbox', path: 'INBOX' }),
  new Label({ id: 'sent', accountId: 'a1', role: 'sent', path: '[Gmail]/Sent Mail' }),
  new Label({ id: 'work', accountId: 'a1', role: null, path: 'Work Stuff' }),
  new Label({ id: 'cafe', accountId: 'a1', role: null, path: 'Caf&AOk-' }),
  new Label({ id: 'rnd', accountId: 'a1', role: null, path: 'R&-D' }),
  new Label({ id: 'nested', accountId: 'a1', role: null, path: 'Caf&AOk-/Men&APw-' }),
  new Label({ id: 'drafts', accountId: 'a1', role: 'drafts', path: '[Gmail]/Drafts' }),
  new Label({ id: 'starred', accountId: 'a1', role: 'starred', path: '[Gmail]/Starred' }),
  new Label({ id: 'important', accountId: 'a1', role: 'important', path: '[Gmail]/Important' }),
  new Label({ id: 'snoozed', accountId: 'a1', role: 'snoozed', path: '[Mailspring]/Snoozed' }),
  new Label({ id: 'junk', accountId: 'a1', role: null, path: 'Junk (Gmail)' }),
  new Label({ id: 'b1', accountId: 'a1', role: null, path: 'open[' }),
  new Label({ id: 'b2', accountId: 'a1', role: null, path: 'close]' }),
  new Label({ id: 'b3', accountId: 'a1', role: null, path: 'open(' }),
  new Label({ id: 'b4', accountId: 'a1', role: null, path: 'close)' }),
];

const imapCategories = [
  new Folder({ id: 'f-inbox', accountId: 'a2', role: 'inbox', path: 'INBOX' }),
  new Folder({ id: 'f-sent', accountId: 'a2', role: 'sent', path: 'Sent' }),
  new Folder({ id: 'f-receipts', accountId: 'a2', role: null, path: 'INBOX.Receipts' }),
  new Folder({ id: 'f-trash', accountId: 'a2', role: 'trash', path: 'Trash' }),
  new Folder({ id: 'f-spam', accountId: 'a2', role: 'spam', path: 'Junk' }),
];

const compileGmail = (query: string) =>
  RemoteSearchQueryBackend.compile(SearchQueryParser.parse(query), gmail, gmailCategories);
// A bare word searches the fields Apple Mail does: `OR FROM OR TO OR CC OR SUBJECT BODY`.
const anyField = (t: string) => [
  'or',
  ['from', t],
  ['to', t],
  ['cc', t],
  ['subject', t],
  ['body', t],
];

const compileIMAP = (query: string) =>
  RemoteSearchQueryBackend.compile(SearchQueryParser.parse(query), imap, imapCategories);

const seconds = (text: string) =>
  Math.floor(DateUtils.getChronoPast().parseDate(text).getTime() / 1000);

describe('RemoteSearchQueryBackend', function () {
  describe('for Gmail', function () {
    it('translates each term to the Gmail operator', function () {
      expect(compileGmail('pineapple')).toEqual({ gmailRaw: 'pineapple' });
      expect(compileGmail('"release notes"')).toEqual({ gmailRaw: '"release notes"' });
      expect(compileGmail('from:alice')).toEqual({ gmailRaw: 'from:alice' });
      expect(compileGmail('to:"Bob Builder"')).toEqual({ gmailRaw: 'to:"Bob Builder"' });
      expect(compileGmail('subject:invoice')).toEqual({ gmailRaw: 'subject:invoice' });
      expect(compileGmail('is:unread')).toEqual({ gmailRaw: 'is:unread' });
      expect(compileGmail('is:read')).toEqual({ gmailRaw: 'is:read' });
      expect(compileGmail('is:starred')).toEqual({ gmailRaw: 'is:starred' });
      expect(compileGmail('is:unstarred')).toEqual({ gmailRaw: '-is:starred' });
      expect(compileGmail('has:attachment')).toEqual({ gmailRaw: 'has:attachment' });
    });

    it('leaves an in: term that names no label to the local search', function () {
      expect(compileGmail('in:unknown')).toBe(null);
      expect(compileGmail('in:archive pineapple')).toBe(null);
      expect(compileGmail('in:"A&-B"')).toBe(null);
    });

    it('leaves a label with brackets or parentheses in its name to the local search', function () {
      expect(compileGmail('in:snoozed')).toBe(null);
      expect(compileGmail('in:"Junk (Gmail)"')).toBe(null);
      for (const name of ['open[', 'close]', 'open(', 'close)']) {
        expect(compileGmail(`in:"${name}"`)).toBe(null);
      }
      expect(compileGmail('in:"[Gmail]/Sent Mail"')).toEqual({ gmailRaw: 'in:sent' });
      expect(compileGmail('in:"[Gmail]/Starred"')).toEqual({ gmailRaw: 'is:starred' });
      expect(compileGmail('in:"Café/Menü"')).toEqual({ gmailRaw: 'label:"Café/Menü"' });
    });

    it('quotes terms Gmail would read as operators or split', function () {
      expect(compileGmail('"a:b"')).toEqual({ gmailRaw: '"a:b"' });
      expect(compileGmail('"-x"')).toEqual({ gmailRaw: '"-x"' });
      expect(compileGmail('"(x)"')).toEqual({ gmailRaw: '"(x)"' });
      expect(compileGmail('"{x}"')).toEqual({ gmailRaw: '"{x}"' });
      expect(compileGmail('ab"c')).toEqual({ gmailRaw: '"abc"' });
      expect(compileGmail('alice@example.com')).toEqual({ gmailRaw: 'alice@example.com' });
      expect(compileGmail('café')).toEqual({ gmailRaw: '"café"' });
    });

    it('sends dates as epoch seconds', function () {
      expect(compileGmail('after:"March 5 2024"')).toEqual({
        gmailRaw: `after:${seconds('March 5 2024')}`,
      });
      expect(compileGmail('since:"March 5 2024"')).toEqual({
        gmailRaw: `after:${seconds('March 5 2024')}`,
      });
      expect(compileGmail('before:"March 5 2024"')).toEqual({
        gmailRaw: `before:${seconds('March 5 2024')}`,
      });
    });

    it('nests AND, OR and NOT', function () {
      expect(compileGmail('from:alice pineapple')).toEqual({ gmailRaw: '(from:alice pineapple)' });
      expect(compileGmail('from:alice OR from:bob')).toEqual({
        gmailRaw: '(from:alice OR from:bob)',
      });
    });

    it('maps folders and labels to in: and label:', function () {
      expect(compileGmail('in:inbox')).toEqual({ gmailRaw: 'in:inbox' });
      expect(compileGmail('in:"[Gmail]/Sent Mail"')).toEqual({ gmailRaw: 'in:sent' });
      expect(compileGmail('in:sent')).toEqual({ gmailRaw: 'in:sent' });
      expect(compileGmail('in:drafts')).toEqual({ gmailRaw: 'in:drafts' });
      expect(compileGmail('in:starred')).toEqual({ gmailRaw: 'is:starred' });
      expect(compileGmail('in:important')).toEqual({ gmailRaw: 'is:important' });
      expect(compileGmail('in:all')).toEqual({ gmailRaw: '(-in:trash -in:spam)' });
      expect(compileGmail('in:"Work Stuff"')).toEqual({ gmailRaw: 'label:"Work Stuff"' });
    });

    it("names a label as Gmail shows it, not as its modified UTF-7 IMAP path", function () {
      expect(compileGmail('in:Café')).toEqual({ gmailRaw: 'label:"Café"' });
      expect(compileGmail('in:"R&D"')).toEqual({ gmailRaw: 'label:"R&D"' });
      expect(compileGmail('in:"Café/Menü"')).toEqual({ gmailRaw: 'label:"Café/Menü"' });
      expect(
        RemoteSearchQueryBackend.compile(SearchQueryParser.parse('in:Trash'), gmail, []).gmailRaw
      ).toBe('in:trash');
    });

    it('searches Trash and Spam only when the query names them', function () {
      expect(compileGmail('in:trash pineapple')).toEqual({
        gmailRaw: '(in:trash pineapple)',
        folderIds: ['all', 'trash', 'spam'],
      });
      expect(compileGmail('pineapple OR in:spam')).toEqual({
        gmailRaw: '(pineapple OR in:spam)',
        folderIds: ['all', 'trash', 'spam'],
      });
      expect(compileGmail('in:inbox').folderIds).toBeUndefined();
    });

    it('leaves an unparseable date to the local search', function () {
      expect(compileGmail('after:"not a date"')).toBe(null);
    });

    it('does not search Trash and Spam for a query that excludes them', function () {
      expect(compileGmail('(pineapple) NOT (in:trash OR in:spam)')).toEqual({
        gmailRaw: '(pineapple -((in:trash OR in:spam)))',
      });
    });

    it('maps Trash and Spam to their operators', function () {
      expect(compileGmail('in:trash').gmailRaw).toBe('in:trash');
      expect(compileGmail('in:spam').gmailRaw).toBe('in:spam');
    });

    it('leaves any NOT but the Trash and Spam exclusion to the local search', function () {
      expect(compileGmail('pineapple NOT pizza')).toBe(null);
      expect(compileGmail('(pineapple NOT pizza) NOT (in:trash OR in:spam)')).toBe(null);
      expect(compileGmail('from:alice OR (pineapple NOT pizza)')).toBe(null);
      expect(compileGmail('pineapple NOT in:sent')).toBe(null);
      expect(compileGmail('pineapple NOT (in:trash OR in:sent)')).toBe(null);
      expect(compileGmail('pineapple NOT in:trash')).toEqual({ gmailRaw: '(pineapple -(in:trash))' });
      expect(compileGmail('(pineapple) NOT (in:Spam OR in:"[Gmail]/Trash")')).toEqual({
        gmailRaw: '(pineapple -((in:spam OR in:trash)))',
      });
    });
  });

  it('raises errors other than an inexpressible query', function () {
    const match = new SearchQueryAST.MatchQueryExpression('x');
    expect(() => RemoteSearchQueryBackend.compile(match, imap, imapCategories)).toThrow();
  });

  describe('for other IMAP servers', function () {
    it('compiles each term to the engine criteria', function () {
      expect(compileIMAP('pineapple')).toEqual({ criteria: anyField('pineapple') });
      expect(compileIMAP('from:alice')).toEqual({ criteria: ['from', 'alice'] });
      expect(compileIMAP('to:bob')).toEqual({ criteria: ['to', 'bob'] });
      expect(compileIMAP('subject:invoice')).toEqual({ criteria: ['subject', 'invoice'] });
      expect(compileIMAP('is:unread')).toEqual({ criteria: ['unread'] });
      expect(compileIMAP('is:read')).toEqual({ criteria: ['read'] });
      expect(compileIMAP('is:starred')).toEqual({ criteria: ['flagged'] });
      expect(compileIMAP('is:unstarred')).toEqual({ criteria: ['unflagged'] });
    });

    it('leaves has:attachment to the local search', function () {
      expect(compileIMAP('has:attachment')).toBe(null);
      expect(compileIMAP('pineapple has:attachment')).toBe(null);
    });

    it('sends dates as the day they fall on', function () {
      expect(compileIMAP('after:"March 5 2024"')).toEqual({ criteria: ['since', '2024-03-05'] });
      expect(compileIMAP('before:"March 5 2024"')).toEqual({ criteria: ['before', '2024-03-05'] });
    });

    it('nests AND, OR and NOT', function () {
      expect(compileIMAP('from:alice pineapple')).toEqual({
        criteria: ['and', ['from', 'alice'], anyField('pineapple')],
      });
      expect(compileIMAP('(from:alice OR from:bob) pineapple')).toEqual({
        criteria: ['and', ['or', ['from', 'alice'], ['from', 'bob']], anyField('pineapple')],
      });
      expect(compileIMAP('(from:alice pineapple) OR subject:x')).toEqual({
        criteria: ['or', ['and', ['from', 'alice'], anyField('pineapple')], ['subject', 'x']],
      });
    });

    it('leaves any NOT but the Trash and Spam exclusion to the local search', function () {
      expect(compileIMAP('pineapple NOT pizza')).toBe(null);
      expect(compileIMAP('(pineapple NOT pizza) NOT (in:trash OR in:spam)')).toBe(null);
      expect(compileIMAP('from:alice OR (pineapple NOT pizza)')).toBe(null);
      expect(compileIMAP('pineapple NOT (in:trash OR in:sent)')).toBe(null);
      expect(compileIMAP('(pineapple) NOT (in:Junk OR in:trash)')).toEqual({
        criteria: anyField('pineapple'),
      });
      // The search bar's exclusion still compiles on an account with no Trash or Spam folder.
      const bare = [new Folder({ id: 'b-inbox', accountId: 'a2', role: 'inbox', path: 'INBOX' })];
      expect(
        RemoteSearchQueryBackend.compile(
          SearchQueryParser.parse('(pineapple) NOT (in:trash OR in:spam)'),
          imap,
          bare
        )
      ).toEqual({ criteria: anyField('pineapple') });
    });

    it('turns top-level in: terms into the folders to search', function () {
      expect(compileIMAP('in:inbox pineapple')).toEqual({
        criteria: anyField('pineapple'),
        folderIds: ['f-inbox'],
      });
      expect(compileIMAP('in:Receipts')).toEqual({ criteria: ['all'], folderIds: ['f-receipts'] });
      expect(compileIMAP('in:inbox.receipts')).toEqual({
        criteria: ['all'],
        folderIds: ['f-receipts'],
      });
      expect(compileIMAP('(in:inbox OR in:sent) pineapple')).toEqual({
        criteria: anyField('pineapple'),
        folderIds: ['f-inbox', 'f-sent'],
      });
      expect(compileIMAP('in:inbox in:sent')).toBe(null);
    });

    it('skips an account whose folders the query never names', function () {
      expect(compileIMAP('in:"Other Account Folder" pineapple')).toBe(null);
    });

    it('drops the Trash and Spam exclusion the search bar adds, which the engine applies', function () {
      expect(compileIMAP('(pineapple) NOT (in:trash OR in:spam)')).toEqual({
        criteria: anyField('pineapple'),
      });
      expect(compileIMAP('(in:inbox pineapple) NOT (in:trash OR in:spam)')).toEqual({
        criteria: anyField('pineapple'),
        folderIds: ['f-inbox'],
      });
    });

    it('searches Trash and Spam when asked to', function () {
      expect(compileIMAP('(pineapple (in:trash OR in:spam))')).toEqual({
        criteria: anyField('pineapple'),
        folderIds: ['f-trash', 'f-spam'],
      });
    });

    it('removes excluded folders from the scope', function () {
      expect(compileIMAP('(in:trash OR in:inbox) NOT in:trash')).toEqual({
        criteria: ['all'],
        folderIds: ['f-inbox'],
      });
      expect(compileIMAP('in:trash NOT in:trash')).toBe(null);
    });

    it('leaves the local search to exclude other folders', function () {
      expect(compileIMAP('pineapple NOT in:sent')).toBe(null);
    });

    it('leaves in: under OR or NOT to the local search', function () {
      expect(compileIMAP('pineapple OR in:inbox')).toBe(null);
      expect(compileIMAP('pineapple NOT in:inbox')).toBe(null);
    });

    it('leaves an unparseable date to the local search', function () {
      expect(compileIMAP('before:"not a date"')).toBe(null);
    });
  });
});
