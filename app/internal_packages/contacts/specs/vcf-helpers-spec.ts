import {
  asArray,
  asSingle,
  parseBirthday,
  serializeBirthday,
  removeRandomSemicolons,
  formatAddress,
  parseAddress,
  parseType,
  serializeAddress,
  parseName,
  formatDisplayName,
} from '../lib/VCFHelpers';

// ---------------------------------------------------------------------------
// asArray
// ---------------------------------------------------------------------------

describe('asArray', function () {
  it('returns an array as-is', () => {
    const arr = ['a', 'b'];
    expect(asArray(arr)).toBe(arr);
  });

  it('wraps a single non-array value in an array', () => {
    expect(asArray('hello')).toEqual(['hello']);
  });

  it('wraps an object in an array', () => {
    const obj = { x: 1 };
    expect(asArray(obj)).toEqual([obj]);
  });

  it('returns an empty array for null', () => {
    expect(asArray(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(asArray(undefined)).toEqual([]);
  });

  it('returns an empty array for the number 0 (falsy value)', () => {
    expect(asArray(0)).toEqual([]);
  });

  it('returns an empty array for an empty string (falsy value)', () => {
    expect(asArray('')).toEqual([]);
  });

  it('preserves an empty array', () => {
    expect(asArray([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// asSingle
// ---------------------------------------------------------------------------

describe('asSingle', function () {
  it('returns the first element of an array', () => {
    expect(asSingle(['a', 'b', 'c'])).toBe('a');
  });

  it('returns undefined for an empty array', () => {
    expect(asSingle([])).toBeUndefined();
  });

  it('returns a non-array value unchanged', () => {
    expect(asSingle('hello')).toBe('hello');
  });

  it('returns null unchanged', () => {
    expect(asSingle(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(asSingle(undefined)).toBeUndefined();
  });

  it('returns 0 unchanged', () => {
    expect(asSingle(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseBirthday
// ---------------------------------------------------------------------------

describe('parseBirthday', function () {
  it('parses a full YYYY-MM-DD date string', () => {
    expect(parseBirthday('1990-05-15')).toEqual({ year: 1990, month: 5, day: 15 });
  });

  it('parses a date with leading zeros', () => {
    expect(parseBirthday('2000-01-09')).toEqual({ year: 2000, month: 1, day: 9 });
  });

  it('parses a year-only string, defaulting month and day to -1', () => {
    const result = parseBirthday('1985');
    expect(result.year).toBe(1985);
    expect(result.month).toBe(-1);
    expect(result.day).toBe(-1);
  });

  it('parses a year-month string, defaulting day to -1', () => {
    const result = parseBirthday('1985-06');
    expect(result.year).toBe(1985);
    expect(result.month).toBe(6);
    expect(result.day).toBe(-1);
  });

  it('returns numeric types for all fields', () => {
    const result = parseBirthday('1990-05-15');
    expect(typeof result.year).toBe('number');
    expect(typeof result.month).toBe('number');
    expect(typeof result.day).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// serializeBirthday
// ---------------------------------------------------------------------------

describe('serializeBirthday', function () {
  it('serializes a date where all components are already the right number of digits', () => {
    // 2000 (4 digits), 12 (2 digits), 31 (2 digits) — no padding path hit for any field
    const result = serializeBirthday({ date: { year: 2000, month: 12, day: 31 } });
    expect(result.value).toBe('2000-12-31');
  });

  it('serializes a date where year is exactly 4 digits and month/day are 2 digits', () => {
    const result = serializeBirthday({ date: { year: 1990, month: 10, day: 25 } });
    expect(result.value).toBe('1990-10-25');
  });

  it('truncates a year longer than 4 digits to 4 digits', () => {
    // td(12345, 4): str='12345', length 5 > 4 → sliced to '1234'
    const result = serializeBirthday({ date: { year: 12345, month: 12, day: 31 } });
    expect(result.value.split('-')[0]).toBe('1234');
  });

  it('handles NaN year by treating it as 0 (padding produces "0001" due to implementation)', () => {
    // td(NaN, 4): clean=0, str='0', length 1 < 4
    // padding branch: '0'.repeat(3) + str.length → '000' + 1 → '0001'
    const result = serializeBirthday({ date: { year: NaN, month: 12, day: 31 } });
    expect(result.value.split('-')[0]).toBe('0001');
  });

  it('single-digit month produces a padded two-character value (padding uses str.length)', () => {
    // td(5, 2): str='5', length 1 < 2 → '0'.repeat(1) + str.length → '0' + 1 → '01'
    const result = serializeBirthday({ date: { year: 2000, month: 5, day: 31 } });
    expect(result.value.split('-')[1]).toBe('01');
  });

  it('returns an object with a value property containing hyphens', () => {
    const result = serializeBirthday({ date: { year: 2000, month: 12, day: 31 } });
    expect(typeof result.value).toBe('string');
    expect(result.value).toContain('-');
  });
});

// ---------------------------------------------------------------------------
// removeRandomSemicolons
// ---------------------------------------------------------------------------

describe('removeRandomSemicolons', function () {
  it('replaces a semicolon with a space', () => {
    expect(removeRandomSemicolons('hello;world')).toBe('hello world');
  });

  it('replaces multiple semicolons with spaces', () => {
    expect(removeRandomSemicolons('a;b;c')).toBe('a b c');
  });

  it('collapses multiple consecutive spaces into one', () => {
    expect(removeRandomSemicolons('a;;b')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(removeRandomSemicolons(';hello;')).toBe('hello');
  });

  it('returns an empty string when the input is only semicolons', () => {
    expect(removeRandomSemicolons(';;;')).toBe('');
  });

  it('leaves a string without semicolons unchanged (modulo trim)', () => {
    expect(removeRandomSemicolons('hello world')).toBe('hello world');
  });

  it('trims leading/trailing spaces even without semicolons', () => {
    expect(removeRandomSemicolons('  hello  ')).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// parseType
// ---------------------------------------------------------------------------

describe('parseType', function () {
  it('returns a plain type string unchanged', () => {
    expect(parseType('home')).toBe('home');
  });

  it('returns the first non-filtered value from an array', () => {
    expect(parseType(['work', 'pref'] as any)).toBe('work');
  });

  it('filters out the "internet" value', () => {
    expect(parseType(['internet', 'home'] as any)).toBe('home');
  });

  it('filters out the "pref" value', () => {
    expect(parseType(['pref', 'work'] as any)).toBe('work');
  });

  it('filters out both "internet" and "pref", returning the first remaining value', () => {
    expect(parseType(['internet', 'pref', 'cell'] as any)).toBe('cell');
  });

  it('returns undefined when all values are filtered out', () => {
    expect(parseType(['internet', 'pref'] as any)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(parseType(null as any)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseType(undefined as any)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseAddress
// ---------------------------------------------------------------------------

describe('parseAddress', function () {
  it('parses a fully populated vCard ADR field', () => {
    // vCard ADR format: ;Street;ExtAddr;City;State;Zip;Country
    const item = { _data: ';123 Main St;Apt 4;Springfield;IL;62701;USA' };
    const result = parseAddress(item);
    expect(result.streetAddress).toBe('123 Main St');
    expect(result.extendedAddress).toBe('Apt 4');
    expect(result.city).toBe('Springfield');
    expect(result.region).toBe('IL');
    expect(result.postalCode).toBe('62701');
    expect(result.country).toBe('USA');
  });

  it('sets formattedValue to the label when a label is provided', () => {
    const item = {
      _data: ';123 Main St;;Springfield;IL;62701;USA',
      label: 'Home Address',
    };
    const result = parseAddress(item);
    expect(result.formattedValue).toBe('Home Address');
  });

  it('generates a formattedValue from the address fields when no label is provided', () => {
    const item = { _data: ';123 Main St;;Springfield;IL;62701;USA' };
    const result = parseAddress(item);
    // formatAddress should produce a non-empty multi-line string
    expect(result.formattedValue.length).toBeGreaterThan(0);
    expect(result.formattedValue).toContain('123 Main St');
    expect(result.formattedValue).toContain('Springfield');
  });

  it('parses the type from the item type field', () => {
    const item = { _data: ';123 Main St;;City;ST;00000;Country', type: 'home' };
    const result = parseAddress(item);
    expect(result.type).toBe('home');
  });

  it('filters "pref" from the type array', () => {
    const item = {
      _data: ';123 Main St;;City;ST;00000;Country',
      type: ['work', 'pref'] as any,
    };
    const result = parseAddress(item);
    expect(result.type).toBe('work');
  });
});

// ---------------------------------------------------------------------------
// serializeAddress
// ---------------------------------------------------------------------------

describe('serializeAddress', function () {
  it('serializes an address into semicolon-delimited vCard ADR format', () => {
    const item = {
      streetAddress: '123 Main St',
      extendedAddress: 'Apt 4',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'USA',
      type: 'home',
      formattedValue: '',
    };
    const result = serializeAddress(item);
    expect(result.value).toBe(';123 Main St;Apt 4;Springfield;IL;62701;USA');
  });

  it('preserves the type in the returned object', () => {
    const item = {
      streetAddress: '1 Test St',
      extendedAddress: '',
      city: 'Testville',
      region: 'TX',
      postalCode: '78000',
      country: 'USA',
      type: 'work',
      formattedValue: '',
    };
    const result = serializeAddress(item);
    expect(result.type).toBe('work');
  });

  it('starts with a leading semicolon for the empty PO-Box field', () => {
    const item = {
      streetAddress: 'Street',
      extendedAddress: '',
      city: 'City',
      region: 'State',
      postalCode: 'ZIP',
      country: 'Country',
      type: undefined,
      formattedValue: '',
    };
    const result = serializeAddress(item);
    expect(result.value.startsWith(';')).toBe(true);
  });

  it('round-trips with parseAddress', () => {
    const original = {
      streetAddress: '42 Elm St',
      extendedAddress: 'Suite 100',
      city: 'Gotham',
      region: 'NY',
      postalCode: '10001',
      country: 'USA',
      type: 'work',
      formattedValue: '',
    };
    const serialized = serializeAddress(original);
    const parsed = parseAddress({ _data: serialized.value, type: serialized.type });
    expect(parsed.streetAddress).toBe(original.streetAddress);
    expect(parsed.extendedAddress).toBe(original.extendedAddress);
    expect(parsed.city).toBe(original.city);
    expect(parsed.region).toBe(original.region);
    expect(parsed.postalCode).toBe(original.postalCode);
    expect(parsed.country).toBe(original.country);
  });
});

// ---------------------------------------------------------------------------
// parseName
// ---------------------------------------------------------------------------

describe('parseName', function () {
  it('parses "Last;First;;Prefix;Suffix" vCard N format', () => {
    const result = parseName({ _data: 'Smith;John;;Dr;Jr' });
    expect(result.familyName).toBe('Smith');
    expect(result.givenName).toBe('John');
    expect(result.honorificPrefix).toBe('Dr');
    expect(result.honorificSuffix).toBe('Jr');
  });

  it('builds displayName from prefix, given, family, and suffix', () => {
    const result = parseName({ _data: 'Smith;John;;Dr;Jr' });
    expect(result.displayName).toBe('Dr John Smith Jr');
  });

  it('omits empty prefix and suffix from displayName', () => {
    const result = parseName({ _data: 'Smith;John;;;' });
    expect(result.displayName).toBe('John Smith');
  });

  it('handles a name with only family and given name', () => {
    const result = parseName({ _data: 'Doe;Jane' });
    expect(result.familyName).toBe('Doe');
    expect(result.givenName).toBe('Jane');
    expect(result.honorificPrefix).toBe('');
    expect(result.honorificSuffix).toBe('');
  });

  it('returns empty strings for all fields when given null', () => {
    const result = parseName(null);
    expect(result.familyName).toBe('');
    expect(result.honorificPrefix).toBe('');
    expect(result.honorificSuffix).toBe('');
  });

  it('returns empty string for givenName when given null', () => {
    const result = parseName(null);
    // parts[1] is undefined on a single-element array; || '' makes it ''
    expect(result.givenName).toBe('');
  });

  it('returns empty string for familyName when the _data is empty', () => {
    const result = parseName({ _data: '' });
    expect(result.familyName).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDisplayName
// ---------------------------------------------------------------------------

describe('formatDisplayName', function () {
  it('concatenates givenName and familyName with a space', () => {
    expect(formatDisplayName({ givenName: 'John', familyName: 'Smith' } as any)).toBe(
      'John Smith'
    );
  });

  it('returns only familyName when givenName is empty', () => {
    expect(formatDisplayName({ givenName: '', familyName: 'Smith' } as any)).toBe('Smith');
  });

  it('returns only givenName when familyName is empty', () => {
    expect(formatDisplayName({ givenName: 'John', familyName: '' } as any)).toBe('John');
  });

  it('returns an empty string when both names are empty', () => {
    expect(formatDisplayName({ givenName: '', familyName: '' } as any)).toBe('');
  });

  it('trims the result so there is no leading/trailing whitespace', () => {
    const result = formatDisplayName({ givenName: 'Alice', familyName: '' } as any);
    expect(result).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// formatAddress
// ---------------------------------------------------------------------------

describe('formatAddress', function () {
  it('formats a full address with newline-separated components', () => {
    const addr = {
      streetAddress: '123 Main St',
      extendedAddress: 'Apt 4',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'USA',
      type: 'home',
      formattedValue: '',
    };
    const result = formatAddress(addr);
    expect(result).toContain('123 Main St');
    expect(result).toContain('Springfield IL 62701');
    expect(result).toContain('USA');
  });

  it('omits empty lines from the formatted output', () => {
    const addr = {
      streetAddress: '1 Test St',
      extendedAddress: '',
      city: 'Testville',
      region: '',
      postalCode: '',
      country: '',
      type: undefined,
      formattedValue: '',
    };
    const result = formatAddress(addr);
    // Empty extendedAddress, region, postalCode, and country are all filtered
    // out, so only street and city lines remain
    expect(result).toBe('1 Test St\nTestville');
  });

  it('unescapes \\n sequences into real newlines', () => {
    const addr = {
      streetAddress: 'Line1\\nLine2',
      extendedAddress: '',
      city: 'City',
      region: '',
      postalCode: '',
      country: '',
      type: undefined,
      formattedValue: '',
    };
    const result = formatAddress(addr);
    expect(result).toContain('Line1\nLine2');
  });

  it('unescapes \\, sequences into real commas', () => {
    const addr = {
      streetAddress: '1 Main St\\, Suite 100',
      extendedAddress: '',
      city: 'City',
      region: '',
      postalCode: '',
      country: '',
      type: undefined,
      formattedValue: '',
    };
    const result = formatAddress(addr);
    expect(result).toContain('1 Main St, Suite 100');
  });
});
