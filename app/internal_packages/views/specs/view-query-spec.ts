import { AccountStore, Contact, DatabaseStore } from 'mailspring-exports';
import { mailQuery, HANDLERS } from '../lib/bridge/handlers';
import { withTimeout, ViewError } from '../lib/bridge/errors';
import { serializeContact } from '../lib/bridge/serializers';
import { countMessages } from '../lib/bridge/counts';
import { ViewGrant, ViewPermission } from '../lib/bridge/grant';
import { FULL_GRANT } from '../../mcp-server/lib/capabilities/grant';
import { refreshIdentity } from '../../mcp-server/lib/capabilities/identity';

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
  const grant = grantWith(['mail.read']);

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
      spyOn(AccountStore, 'accounts').andReturn([
        { id: 'a1', emailAddress: 'me@example.com', name: 'Me' } as any,
      ]);
      spyOn(AccountStore, 'emailAddresses').andReturn(['me@example.com']);
      // master-before-each already spies on _query.
      (DatabaseStore._query as any).andReturn(
        Promise.resolve([{ email: 'old-alias@example.org' }, { email: null }])
      );
    });

    it('identity.get returns accounts plus addresses found in Sent mail', function () {
      waitsForPromise(async () => {
        await refreshIdentity();
        const identity = await HANDLERS['identity.get'](
          { viewId: 'spec', grant, emit: () => {} },
          {}
        );
        expect(identity.accounts).toEqual([{ id: 'a1', email: 'me@example.com', name: 'Me' }]);
        expect(identity.addresses).toEqual(['me@example.com', 'old-alias@example.org']);
      });
    });

    it('marks contacts at discovered addresses as me', function () {
      waitsForPromise(async () => {
        await refreshIdentity();
        const alias = serializeContact(new Contact({ email: 'Old-Alias@example.org', name: 'Me' }));
        const other = serializeContact(new Contact({ email: 'bob@example.net' }));
        expect(alias.isMe).toBe(true);
        expect(other.isMe).toBe(false);
      });
    });

    it('adds addresses that send under one of my account names', function () {
      (AccountStore.accounts as any).andReturn([
        { id: 'a1', emailAddress: 'me@example.com', name: 'Pat Example' } as any,
      ]);
      (DatabaseStore._query as any).andCallFake((sql) =>
        Promise.resolve(
          sql.includes('trim(')
            ? [
                { email: 'pat@oldjob.com', name: 'pat example' },
                { email: 'pat.side@example.org', name: 'pat example (side project)' },
                { email: 'notifications@social.com', name: 'pat example' },
                { email: 'other@example.com', name: 'pat examples' },
                { email: 'someone@example.com', name: 'pat example on social' },
              ]
            : []
        )
      );
      waitsForPromise(async () => {
        await refreshIdentity();
        const identity = await HANDLERS['identity.get'](
          { viewId: 'spec', grant, emit: () => {} },
          {}
        );
        expect(identity.addresses).toEqual([
          'me@example.com',
          'pat.side@example.org',
          'pat@oldjob.com',
        ]);
      });
    });

    it('requires mail.read', function () {
      waitsForPromise(async () => {
        const err = await errorFrom(() =>
          HANDLERS['identity.get']({ viewId: 'spec', grant: grantWith([]), emit: () => {} }, {})
        );
        expect(err.code).toBe('permission');
      });
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
  });
});
