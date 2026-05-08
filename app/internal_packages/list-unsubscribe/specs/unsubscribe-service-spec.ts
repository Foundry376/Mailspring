import {
  parseListUnsubscribeHeader,
  supportsOneClick,
  getBestUnsubscribeOption,
  UnsubscribeOption,
} from '../lib/unsubscribe-service';

// ---------------------------------------------------------------------------
// parseListUnsubscribeHeader
// ---------------------------------------------------------------------------

describe('parseListUnsubscribeHeader', function () {
  describe('standard valid headers', () => {
    it('parses a header with both mailto and https URIs', () => {
      const header = '<mailto:unsubscribe@example.com>, <https://example.com/unsub>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ type: 'mailto', uri: 'mailto:unsubscribe@example.com' });
      expect(result[1]).toEqual({ type: 'https', uri: 'https://example.com/unsub' });
    });

    it('parses a header with a single https URI', () => {
      const header = '<https://example.com/unsubscribe?id=123>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({
        type: 'https',
        uri: 'https://example.com/unsubscribe?id=123',
      });
    });

    it('parses a header with a single mailto URI', () => {
      const header = '<mailto:list-unsub@newsletter.example.com?subject=unsubscribe>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('mailto');
      expect(result[0].uri).toBe('mailto:list-unsub@newsletter.example.com?subject=unsubscribe');
    });

    it('parses a header with an http URI', () => {
      const header = '<http://example.com/unsub>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ type: 'http', uri: 'http://example.com/unsub' });
    });

    it('parses multiple URIs in a single header', () => {
      const header =
        '<https://a.example.com/unsub>, <mailto:a@example.com>, <http://b.example.com/unsub>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(3);
      expect(result[0].type).toBe('https');
      expect(result[1].type).toBe('mailto');
      expect(result[2].type).toBe('http');
    });
  });

  describe('empty and invalid inputs', () => {
    it('returns an empty array for an empty string', () => {
      expect(parseListUnsubscribeHeader('')).toEqual([]);
    });

    it('returns an empty array for null', () => {
      expect(parseListUnsubscribeHeader(null as any)).toEqual([]);
    });

    it('returns an empty array for undefined', () => {
      expect(parseListUnsubscribeHeader(undefined as any)).toEqual([]);
    });

    it('returns an empty array for a non-string number', () => {
      expect(parseListUnsubscribeHeader(42 as any)).toEqual([]);
    });

    it('returns an empty array for a non-string object', () => {
      expect(parseListUnsubscribeHeader({} as any)).toEqual([]);
    });
  });

  describe('malformed URI formats', () => {
    it('ignores URIs not enclosed in angle brackets', () => {
      const header = 'mailto:unsubscribe@example.com, https://example.com/unsub';
      expect(parseListUnsubscribeHeader(header)).toEqual([]);
    });

    it('ignores URIs with unrecognised schemes', () => {
      const header = '<ftp://example.com/unsub>';
      expect(parseListUnsubscribeHeader(header)).toEqual([]);
    });

    it('ignores a bare string with no angle brackets', () => {
      expect(parseListUnsubscribeHeader('no brackets at all')).toEqual([]);
    });
  });

  describe('protocol case sensitivity', () => {
    it('accepts HTTPS in mixed case', () => {
      const header = '<HTTPS://example.com/unsub>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('https');
    });

    it('accepts HTTP in uppercase', () => {
      const header = '<HTTP://example.com/unsub>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('http');
    });

    it('accepts MAILTO in uppercase', () => {
      const header = '<MAILTO:unsub@example.com>';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('mailto');
    });
  });

  describe('whitespace handling', () => {
    it('trims whitespace inside angle brackets', () => {
      const header = '<  https://example.com/unsub  >';
      const result = parseListUnsubscribeHeader(header);
      expect(result.length).toBe(1);
      expect(result[0].uri).toBe('https://example.com/unsub');
    });
  });
});

// ---------------------------------------------------------------------------
// supportsOneClick
// ---------------------------------------------------------------------------

describe('supportsOneClick', function () {
  it('returns true for the exact RFC 8058 value', () => {
    expect(supportsOneClick('List-Unsubscribe=One-Click')).toBe(true);
  });

  it('returns true when the value has leading and trailing whitespace', () => {
    expect(supportsOneClick('  List-Unsubscribe=One-Click  ')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(supportsOneClick('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(supportsOneClick(null as any)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(supportsOneClick(undefined)).toBe(false);
  });

  it('returns false for a different header value', () => {
    expect(supportsOneClick('One-Click')).toBe(false);
  });

  it('returns false for a partial match', () => {
    expect(supportsOneClick('List-Unsubscribe=One-Click; extra')).toBe(false);
  });

  it('is case-sensitive and returns false for wrong casing', () => {
    expect(supportsOneClick('list-unsubscribe=one-click')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBestUnsubscribeOption
// ---------------------------------------------------------------------------

describe('getBestUnsubscribeOption', function () {
  const httpsOption: UnsubscribeOption = {
    type: 'https',
    uri: 'https://example.com/unsub',
  };
  const httpOption: UnsubscribeOption = {
    type: 'http',
    uri: 'http://example.com/unsub',
  };
  const mailtoOption: UnsubscribeOption = {
    type: 'mailto',
    uri: 'mailto:unsub@example.com',
  };

  describe('empty options', () => {
    it('returns null when the options array is empty', () => {
      expect(getBestUnsubscribeOption([], true)).toBeNull();
      expect(getBestUnsubscribeOption([], false)).toBeNull();
    });
  });

  describe('with one-click support', () => {
    it('returns the https option with method one-click when one-click is supported', () => {
      const result = getBestUnsubscribeOption([httpsOption, mailtoOption], true);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(httpsOption);
      expect(result!.method).toBe('one-click');
    });

    it('falls through to mailto when there is no https option but one-click is claimed', () => {
      const result = getBestUnsubscribeOption([mailtoOption], true);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(mailtoOption);
      expect(result!.method).toBe('mailto');
    });

    it('falls through to http web option when no https and no mailto under one-click', () => {
      const result = getBestUnsubscribeOption([httpOption], true);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(httpOption);
      expect(result!.method).toBe('web');
    });
  });

  describe('without one-click support', () => {
    it('prefers mailto over https when one-click is not supported', () => {
      const result = getBestUnsubscribeOption([httpsOption, mailtoOption], false);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(mailtoOption);
      expect(result!.method).toBe('mailto');
    });

    it('prefers mailto over http when one-click is not supported', () => {
      const result = getBestUnsubscribeOption([httpOption, mailtoOption], false);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(mailtoOption);
      expect(result!.method).toBe('mailto');
    });

    it('returns https as web fallback when only https is available', () => {
      const result = getBestUnsubscribeOption([httpsOption], false);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(httpsOption);
      expect(result!.method).toBe('web');
    });

    it('returns http as web fallback when only http is available', () => {
      const result = getBestUnsubscribeOption([httpOption], false);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(httpOption);
      expect(result!.method).toBe('web');
    });

    it('returns mailto method when only mailto is available', () => {
      const result = getBestUnsubscribeOption([mailtoOption], false);
      expect(result).not.toBeNull();
      expect(result!.option).toBe(mailtoOption);
      expect(result!.method).toBe('mailto');
    });
  });

  describe('option ordering', () => {
    it('picks the first https option when multiple https options exist with one-click', () => {
      const httpsOption2: UnsubscribeOption = {
        type: 'https',
        uri: 'https://other.example.com/unsub',
      };
      const result = getBestUnsubscribeOption([httpsOption, httpsOption2], true);
      expect(result!.option).toBe(httpsOption);
    });

    it('picks the first mailto option when multiple mailto options exist', () => {
      const mailtoOption2: UnsubscribeOption = {
        type: 'mailto',
        uri: 'mailto:other@example.com',
      };
      const result = getBestUnsubscribeOption([mailtoOption, mailtoOption2], false);
      expect(result!.option).toBe(mailtoOption);
    });
  });
});
