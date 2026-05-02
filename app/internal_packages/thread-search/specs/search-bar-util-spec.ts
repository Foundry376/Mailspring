import {
  TokenAndTermRegexp,
  rankOfRole,
  wrapInQuotes,
  getCurrentTokenAndTerm,
} from '../lib/search-bar-util';

describe('search-bar-util', function () {
  describe('rankOfRole()', function () {
    it("returns 20 for 'inbox' (highest rank)", function () {
      expect(rankOfRole('inbox')).toBe(20);
    });

    it("returns 19 for 'important'", function () {
      expect(rankOfRole('important')).toBe(19);
    });

    it("returns 18 for 'snoozed'", function () {
      expect(rankOfRole('snoozed')).toBe(18);
    });

    it("returns 17 for 'sent'", function () {
      expect(rankOfRole('sent')).toBe(17);
    });

    it("returns 16 for 'all'", function () {
      expect(rankOfRole('all')).toBe(16);
    });

    it("returns 15 for 'spam'", function () {
      expect(rankOfRole('spam')).toBe(15);
    });

    it("returns 14 for 'trash' (lowest named rank)", function () {
      expect(rankOfRole('trash')).toBe(14);
    });

    it('returns -1000 for an unknown role', function () {
      expect(rankOfRole('promotions')).toBe(-1000);
      expect(rankOfRole('updates')).toBe(-1000);
      expect(rankOfRole('')).toBe(-1000);
      expect(rankOfRole(null)).toBe(-1000);
    });

    it('orders inbox above trash', function () {
      expect(rankOfRole('inbox')).toBeGreaterThan(rankOfRole('trash'));
    });

    it('orders all named roles above unknown roles', function () {
      const namedRoles = ['inbox', 'important', 'snoozed', 'sent', 'all', 'spam', 'trash'];
      for (const role of namedRoles) {
        expect(rankOfRole(role)).toBeGreaterThan(rankOfRole('unknown'));
      }
    });
  });

  describe('wrapInQuotes()', function () {
    it('wraps a simple string in double quotes', function () {
      expect(wrapInQuotes('hello')).toBe('"hello"');
    });

    it('wraps a string with spaces in double quotes', function () {
      expect(wrapInQuotes('John Doe')).toBe('"John Doe"');
    });

    it('removes existing double quotes before wrapping', function () {
      expect(wrapInQuotes('"already quoted"')).toBe('"already quoted"');
    });

    it('removes all internal double quotes', function () {
      expect(wrapInQuotes('say "hello" to "world"')).toBe('"say hello to world"');
    });

    it('wraps an empty string', function () {
      expect(wrapInQuotes('')).toBe('""');
    });
  });

  describe('TokenAndTermRegexp()', function () {
    it('returns a new RegExp instance on each call (stateless)', function () {
      const r1 = TokenAndTermRegexp();
      const r2 = TokenAndTermRegexp();
      expect(r1).not.toBe(r2);
    });

    it('matches the full token "from" with a term', function () {
      const matches = 'from:test@example.com'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches the full token "to" with a term', function () {
      const matches = 'to:user@example.com'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "subject" with a term', function () {
      const matches = 'subject:hello'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "in" with a term', function () {
      const matches = 'in:inbox'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "has" with a term', function () {
      const matches = 'has:attachment'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "before" with a term', function () {
      const matches = 'before:yesterday'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "after" with a term', function () {
      const matches = 'after:yesterday'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches "is" with a term', function () {
      const matches = 'is:unread'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });

    it('matches partial tokens: "fr", "fro", "from" all match', function () {
      expect('fr:test'.match(TokenAndTermRegexp())).not.toBeNull();
      expect('fro:test'.match(TokenAndTermRegexp())).not.toBeNull();
      expect('from:test'.match(TokenAndTermRegexp())).not.toBeNull();
    });

    it('matches partial tokens: "t", "to" both match', function () {
      expect('t:test'.match(TokenAndTermRegexp())).not.toBeNull();
      expect('to:test'.match(TokenAndTermRegexp())).not.toBeNull();
    });

    it('matches quoted terms', function () {
      const regexp = TokenAndTermRegexp();
      let match = null;
      regexp.lastIndex = 0;
      let next = null;
      while ((next = regexp.exec('from:"John Doe"'))) {
        match = next;
      }
      expect(match).not.toBeNull();
    });

    it('matches tokens with a space after the colon', function () {
      const matches = 'from: test@example.com'.match(TokenAndTermRegexp());
      expect(matches).not.toBeNull();
    });
  });

  describe('getCurrentTokenAndTerm()', function () {
    describe('basic token detection', function () {
      it('detects "from" token and its term at cursor within the token', function () {
        const query = 'from:test@example.com';
        const result = getCurrentTokenAndTerm(query, 5);
        expect(result.token).toBe('from');
        expect(result.term).toBe('test@example.com');
      });

      it('detects "to" token and its term', function () {
        const query = 'to:user';
        const result = getCurrentTokenAndTerm(query, 3);
        expect(result.token).toBe('to');
        expect(result.term).toBe('user');
      });

      it('detects "subject" token and its term', function () {
        const query = 'subject:hello';
        const result = getCurrentTokenAndTerm(query, 8);
        expect(result.token).toBe('subject');
        expect(result.term).toBe('hello');
      });
    });

    describe('cursor position handling', function () {
      it('returns null token when cursor is outside any token', function () {
        const query = 'from:test some free text';
        // Cursor at position 20 — in "free text", no token
        const result = getCurrentTokenAndTerm(query, 20);
        expect(result.token).toBeNull();
        expect(result.term).toBeNull();
        expect(result.index).toBe(-1);
        expect(result.length).toBe(0);
      });

      it('detects the token when cursor is at the very start of it', function () {
        const query = 'from:hello';
        const result = getCurrentTokenAndTerm(query, 0);
        expect(result.token).toBe('from');
      });

      it('detects the token when cursor is at the end of the match', function () {
        const query = 'from:hi';
        const result = getCurrentTokenAndTerm(query, query.length);
        expect(result.token).toBe('from');
        expect(result.term).toBe('hi');
      });

      it('detects a token that appears after preceding text', function () {
        const query = 'hello from:world';
        // Cursor at 12 — inside "from:world"
        const result = getCurrentTokenAndTerm(query, 12);
        expect(result.token).toBe('from');
        expect(result.term).toBe('world');
      });
    });

    describe('multiple tokens in query', function () {
      it('picks the correct token when query has multiple tokens', function () {
        const query = 'from:alice to:bob';
        // Cursor at 14 — inside "to:bob"
        const result = getCurrentTokenAndTerm(query, 14);
        expect(result.token).toBe('to');
        expect(result.term).toBe('bob');
      });

      it('picks the first token when cursor is inside it', function () {
        const query = 'from:alice to:bob';
        // Cursor at 5 — inside "from:alice"
        const result = getCurrentTokenAndTerm(query, 5);
        expect(result.token).toBe('from');
        expect(result.term).toBe('alice');
      });
    });

    describe('quoted terms', function () {
      it('strips surrounding quotes from a quoted term', function () {
        const query = 'from:"John Doe"';
        const result = getCurrentTokenAndTerm(query, 8);
        expect(result.token).toBe('from');
        expect(result.term).toBe('john doe');
      });

      it('lowercases the term', function () {
        const query = 'from:Alice';
        const result = getCurrentTokenAndTerm(query, 5);
        expect(result.term).toBe('alice');
      });
    });

    describe('partial token matching', function () {
      it('matches a partial "from" token like "fr"', function () {
        const query = 'fr:test';
        const result = getCurrentTokenAndTerm(query, 4);
        expect(result.token).not.toBeNull();
        expect(result.token.toLowerCase()).toMatch(/^fr/);
      });

      it('matches a partial "subject" token like "sub"', function () {
        const query = 'sub:keyword';
        const result = getCurrentTokenAndTerm(query, 5);
        expect(result.token).not.toBeNull();
      });
    });

    describe('return shape', function () {
      it('returns index and length of the matched token span', function () {
        const query = 'from:test';
        const result = getCurrentTokenAndTerm(query, 5);
        expect(typeof result.index).toBe('number');
        expect(typeof result.length).toBe('number');
        expect(result.index).toBe(0);
        expect(result.length).toBe(query.length);
      });

      it('returns {token: null, term: null, index: -1, length: 0} when no match', function () {
        const result = getCurrentTokenAndTerm('just some plain text', 5);
        expect(result.token).toBeNull();
        expect(result.term).toBeNull();
        expect(result.index).toBe(-1);
        expect(result.length).toBe(0);
      });
    });
  });
});
