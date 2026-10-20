import { AccountStore, Contact, DatabaseStore } from 'mailspring-exports';
import { mailQuery, HANDLERS } from '../lib/bridge/handlers';
import { withTimeout, ViewError } from '../lib/bridge/errors';
import { serializeContact } from '../lib/bridge/serializers';
import { countMessages } from '../lib/bridge/counts';
import { ViewGrant, ViewPermission } from '../lib/bridge/grant';
import { FULL_GRANT } from '../../../src/services/mail-access/grant';

function grantWith(permissions: ViewPermission[]): ViewGrant {
  return {
    viewId: 'spec',
    namespace: 'view:spec',
    permissions: new Set(permissions),
    scope: FULL_GRANT,
  };
}

async function errorFrom(fn: () => any) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

describe('View queries', function () {
  const grant = grantWith([]);

  describe('mailQuery', function () {
    it('accepts a JSON filter under `where`', function () {
      const q = mailQuery(grant, 'threads', { where: { from: 'uber.com' }, limit: 5 });
      expect(q.filter).toEqual({ from: 'uber.com' });
      expect(q.limit).toBe(5);
      expect(q.background).toBe(true);
    });

    it('points filters written at the top level to `where`', function () {
      const err = (() => {
        try {
          mailQuery(grant, 'threads', { from: 'uber.com' });
        } catch (e) {
          return e;
        }
      })();
      expect(err instanceof ViewError).toBe(true);
      expect(err.code).toBe('invalid');
      expect(err.message).toContain('where');
    });

    it('returns filter validation errors as ViewErrors with the same code', function () {
      const invalid = (() => {
        try {
          mailQuery(grant, 'threads', { where: { from: 'a@b.com', to: 'c@d.com' } });
        } catch (e) {
          return e;
        }
      })();
      expect(invalid.code).toBe('invalid');

      const limit = (() => {
        try {
          mailQuery(grant, 'messages', {
            where: { from: Array.from({ length: 501 }, (_, i) => `p${i}@x.com`) },
          });
        } catch (e) {
          return e;
        }
      })();
      expect(limit.code).toBe('limit');
    });

    it('still accepts a search string for user-typed queries', function () {
      expect(mailQuery(grant, 'threads', 'is:unread').search).toBe('is:unread');
    });
  });

  describe('withTimeout', function () {
    it('rejects with a timeout ViewError instead of waiting forever', function () {
      // Spec timers are mocked, so the deadline is reached by advancing the clock.
      let err = null;
      withTimeout(new Promise(() => {}), 10).catch((e) => (err = e));
      advanceClock(20);
      waitsFor(() => err !== null);
      runs(() => expect(err.code).toBe('timeout'));
    });

    it('passes through results that arrive in time', function () {
      waitsForPromise(async () => {
        expect(await withTimeout(Promise.resolve(42), 1000)).toBe(42);
      });
    });
  });

  describe('identity', function () {
    beforeEach(function () {
      const accounts = [
        { id: 'a1', emailAddress: 'me@example.com', name: 'Me' },
        { id: 'a2', emailAddress: 'work@example.org', name: 'Me' },
      ];
      spyOn(AccountStore, 'accounts').andReturn(accounts as any);
      spyOn(AccountStore, 'accountForId').andCallFake((id) => accounts.find((a) => a.id === id));
      spyOn(AccountStore, 'aliases').andReturn([
        new Contact({ accountId: 'a1', email: 'me@example.com' }),
        new Contact({ accountId: 'a1', email: 'Alias@Example.com' }),
        new Contact({ accountId: 'a2', email: 'work@example.org' }),
      ] as any);
      spyOn(AccountStore, 'emailAddresses').andReturn([
        'me@example.com',
        'Alias@Example.com',
        'work@example.org',
      ]);
    });

    it('identity.get returns the granted accounts with their addresses and aliases', function () {
      waitsForPromise(async () => {
        const identity = await HANDLERS['identity.get'](
          { viewId: 'spec', grant, emit: () => {} },
          {}
        );
        expect(identity.accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
        expect(identity.addresses).toEqual([
          'alias@example.com',
          'me@example.com',
          'work@example.org',
        ]);

        const scoped = { ...grant, scope: { accountIds: ['a2'], excludedFolderIds: {} } };
        const one = await HANDLERS['identity.get'](
          { viewId: 'spec', grant: scoped, emit: () => {} },
          {}
        );
        expect(one).toEqual({
          accounts: [{ id: 'a2', email: 'work@example.org', name: 'Me' }],
          addresses: ['work@example.org'],
        });
      });
    });

    it('marks contacts at configured aliases as me', function () {
      const alias = serializeContact(new Contact({ email: 'alias@example.com', name: 'Me' }));
      const other = serializeContact(new Contact({ email: 'bob@example.net' }));
      expect(alias.isMe).toBe(true);
      expect(other.isMe).toBe(false);
    });
  });

  describe('counts', function () {
    it('labels person keys with a display name and flags the user', function () {
      spyOn(AccountStore, 'accounts').andReturn([]);
      spyOn(AccountStore, 'emailAddresses').andReturn(['me@example.com']);
      (DatabaseStore._query as any).andCallFake((sql) => {
        if (!sql.includes('COUNT(DISTINCT')) return Promise.resolve([]);
        expect(sql).toContain('AS n0');
        return Promise.resolve([
          { k0: 'bob@example.net', n0: 'Bob Smith', count: 3, first: 1, last: 2 },
          { k0: 'me@example.com', n0: null, count: 1, first: 1, last: 1 },
        ]);
      });
      waitsForPromise(async () => {
        const rows = await countMessages(
          grant,
          mailQuery(grant, 'messages', { where: { direction: 'received' } }),
          ['sender']
        );
        expect(rows[0].labels).toEqual({ sender: 'Bob Smith' });
        expect(rows[0].isMe).toEqual({ sender: false });
        expect(rows[1].labels).toEqual({});
        expect(rows[1].isMe).toEqual({ sender: true });
      });
    });

    it('leaves out every thread in an excluded folder, so its category never appears', function () {
      spyOn(AccountStore, 'accounts').andReturn([{ id: 'a1' }, { id: 'a2' }] as any);
      spyOn(AccountStore, 'emailAddresses').andReturn([]);
      let countSQL = '';
      (DatabaseStore._query as any).andCallFake((sql) => {
        if (sql.includes('COUNT(DISTINCT')) countSQL = sql;
        return Promise.resolve([]);
      });
      const excluding: ViewGrant = {
        ...grant,
        scope: { accountIds: null, excludedFolderIds: { a1: ["private'1"], a2: [] } },
      };
      waitsForPromise(async () => {
        await countMessages(excluding, mailQuery(excluding, 'messages', {}), ['category']);
        expect(countSQL).toContain(
          "`Message`.`threadId` NOT IN (SELECT `id` FROM `ThreadCategory` WHERE `value` IN ('private''1'))"
        );
        await countMessages(grant, mailQuery(grant, 'messages', {}), ['category']);
        expect(countSQL).not.toContain('NOT IN');
      });
    });
  });
});
