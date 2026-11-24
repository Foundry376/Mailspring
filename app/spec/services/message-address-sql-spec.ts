import { wholeAddress } from '../../src/services/message-address-sql';

describe('wholeAddress', function () {
  it('trims an address and lowercases its ASCII letters', function () {
    expect(wholeAddress(' Bob@Example.COM ')).toBe('bob@example.com');
    expect(wholeAddress("O'Brien+tag@mail.example.co.uk")).toBe("o'brien+tag@mail.example.co.uk");
    expect(wholeAddress('JÖRG@Example.de')).toBe('jÖrg@example.de');
  });

  it('is null for a value with brackets, separators, quotes or wildcards', function () {
    for (const value of [
      '<bob@example.com>',
      'bob@example.com,',
      'bob@example.com;',
      '"bob"@example.com',
      '*@example.com',
      'bob@*.example.com',
      'bob smith@example.com',
    ]) {
      expect(wholeAddress(value)).toBe(null);
    }
  });

  it('is null for a partial address', function () {
    for (const value of [
      'bob',
      'bob@',
      '@example.com',
      'example.com',
      'bob@example',
      'bob@example.',
    ]) {
      expect(wholeAddress(value)).toBe(null);
    }
  });
});
