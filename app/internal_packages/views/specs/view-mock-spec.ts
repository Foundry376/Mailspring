import { expandMockData, resolveDateTokens } from '../lib/mock/mock-data';
import { countMockMessages, findMessages, findThreads } from '../lib/mock/mock-query';

const query = (filter: any, extra: any = {}) => ({ filter, limit: 100, offset: 0, ...extra });

describe('Views mock data', function () {
  const data = expandMockData({
    me: { name: 'Sam', email: 'sam@example.com' },
    threads: [
      {
        id: 'replied',
        subject: 'Renewal',
        messages: [
          { from: 'Ana <ana@acme.example>', date: '@now-2d' },
          { from: 'me', to: 'ana@acme.example', date: '@now-1d' },
        ],
      },
      {
        id: 'unanswered',
        subject: 'Invoice',
        messages: [{ from: 'billing@acme.example', date: '@now-3h' }],
      },
    ],
  });
  const ids = (result) => result.items.map((t) => t.id).sort();

  it('resolves relative date tokens', function () {
    const now = new Date(2026, 9, 16, 12, 0);
    expect(resolveDateTokens('@date-3d', now)).toEqual('2026-10-13');
    expect(new Date(resolveDateTokens('@today+1d 09:30', now)).getHours()).toEqual(9);
    expect(resolveDateTokens({ when: ['@now'] }, now)).toEqual({ when: [now.toISOString()] });
  });

  it('applies message conditions in thread queries one at a time, as the real compiler does', function () {
    // A thread with no sent message, not "a thread with some received message".
    expect(ids(findThreads(data, query({ not: { direction: 'sent' } }) as any))).toEqual([
      'unanswered',
    ]);
    // From acme and sent by me are different messages of the same thread.
    expect(
      ids(
        findThreads(data, query({ and: [{ from: 'acme.example' }, { direction: 'sent' }] }) as any)
      )
    ).toEqual(['replied']);
    expect(
      findMessages(data, query({ and: [{ from: 'acme.example' }, { direction: 'sent' }] }) as any)
        .items
    ).toEqual([]);
  });

  it('counts the messages it holds', function () {
    const rows = countMockMessages(data, query(undefined) as any, ['sender']);
    expect(rows.map((r) => [r.key.sender, r.count, r.isMe.sender]).sort()).toEqual([
      ['ana@acme.example', 1, false],
      ['billing@acme.example', 1, false],
      ['sam@example.com', 1, true],
    ]);
  });
});
