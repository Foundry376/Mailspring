import { defaultEmlFilename } from '../../src/services/eml-utils';

describe('defaultEmlFilename', function () {
  describe('normal subjects', () => {
    it('appends .eml to a simple subject', () => {
      expect(defaultEmlFilename('Hello World')).toEqual('Hello World.eml');
    });

    it('preserves alphanumeric characters and spaces', () => {
      expect(defaultEmlFilename('Meeting Notes 2024')).toEqual('Meeting Notes 2024.eml');
    });
  });

  describe('empty and falsy inputs', () => {
    it('returns untitled.eml for an empty string', () => {
      expect(defaultEmlFilename('')).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a null value', () => {
      expect(defaultEmlFilename(null as any)).toEqual('untitled.eml');
    });

    it('returns untitled.eml for an undefined value', () => {
      expect(defaultEmlFilename(undefined as any)).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a whitespace-only string', () => {
      expect(defaultEmlFilename('   ')).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a tab-only string', () => {
      expect(defaultEmlFilename('\t\t')).toEqual('untitled.eml');
    });
  });

  describe('length truncation', () => {
    it('does not truncate a subject of exactly 80 characters', () => {
      const subject = 'a'.repeat(80);
      expect(defaultEmlFilename(subject)).toEqual(`${subject}.eml`);
    });

    it('truncates a subject longer than 80 characters to 80 characters', () => {
      const subject = 'b'.repeat(100);
      const result = defaultEmlFilename(subject);
      // The base name (without .eml) should be 80 chars
      expect(result).toEqual(`${'b'.repeat(80)}.eml`);
    });

    it('truncates a very long subject and still appends .eml', () => {
      const subject = 'Re: ' + 'x'.repeat(200);
      const result = defaultEmlFilename(subject);
      expect(result.length).toEqual(80 + '.eml'.length);
      expect(result.endsWith('.eml')).toBe(true);
    });
  });

  describe('unsafe character replacement', () => {
    it('replaces forward slash with underscore', () => {
      expect(defaultEmlFilename('path/to/file')).toEqual('path_to_file.eml');
    });

    it('replaces question mark with underscore', () => {
      expect(defaultEmlFilename('What?')).toEqual('What_.eml');
    });

    it('replaces less-than sign with underscore', () => {
      expect(defaultEmlFilename('a<b')).toEqual('a_b.eml');
    });

    it('replaces greater-than sign with underscore', () => {
      expect(defaultEmlFilename('a>b')).toEqual('a_b.eml');
    });

    it('replaces backslash with underscore', () => {
      expect(defaultEmlFilename('C:\\Users\\file')).toEqual('C__Users_file.eml');
    });

    it('replaces colon with underscore', () => {
      expect(defaultEmlFilename('Re: Hello')).toEqual('Re_ Hello.eml');
    });

    it('replaces asterisk with underscore', () => {
      expect(defaultEmlFilename('Note *important*')).toEqual('Note _important_.eml');
    });

    it('replaces pipe with underscore', () => {
      expect(defaultEmlFilename('a|b')).toEqual('a_b.eml');
    });

    it('replaces double-quote with underscore', () => {
      expect(defaultEmlFilename('"Quoted Subject"')).toEqual('_Quoted Subject_.eml');
    });

    it('replaces multiple unsafe characters in one subject', () => {
      expect(defaultEmlFilename('Re: <bold> "hello"')).toEqual('Re_ _bold_ _hello_.eml');
    });
  });

  describe('control character stripping', () => {
    it('strips null byte (U+0000)', () => {
      expect(defaultEmlFilename('hello\u0000world')).toEqual('helloworld.eml');
    });

    it('strips newline (U+000A)', () => {
      expect(defaultEmlFilename('line1\nline2')).toEqual('line1line2.eml');
    });

    it('strips carriage return (U+000D)', () => {
      expect(defaultEmlFilename('line1\rline2')).toEqual('line1line2.eml');
    });

    it('strips DEL character (U+007F)', () => {
      expect(defaultEmlFilename('hello\u007fworld')).toEqual('helloworld.eml');
    });

    it('strips all C0 control characters', () => {
      // Build a string with chars 0x01–0x1F between "a" and "b"
      const controls = Array.from({ length: 31 }, (_, i) =>
        String.fromCharCode(i + 1)
      ).join('');
      expect(defaultEmlFilename(`a${controls}b`)).toEqual('ab.eml');
    });
  });

  describe('trailing dots and whitespace removal', () => {
    it('removes a trailing dot', () => {
      expect(defaultEmlFilename('Subject.')).toEqual('Subject.eml');
    });

    it('removes multiple trailing dots', () => {
      expect(defaultEmlFilename('Subject...')).toEqual('Subject.eml');
    });

    it('removes trailing spaces', () => {
      expect(defaultEmlFilename('Subject   ')).toEqual('Subject.eml');
    });

    it('removes trailing mix of dots and spaces', () => {
      expect(defaultEmlFilename('Subject . . ')).toEqual('Subject.eml');
    });

    it('does not remove a leading dot', () => {
      expect(defaultEmlFilename('.hidden')).toEqual('.hidden.eml');
    });

    it('does not remove dots in the middle of the name', () => {
      expect(defaultEmlFilename('v1.2.3 release')).toEqual('v1.2.3 release.eml');
    });
  });
});
