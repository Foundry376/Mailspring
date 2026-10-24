import {
  EMAIL_BEFORE_CURSOR_REGEX,
  URL_BEFORE_CURSOR_REGEX,
  splitEmailPunctuation,
  splitTrailingPunctuation,
} from '../../../src/components/composer-editor/link-plugins';

// slate-auto-replace runs String.match(before) on the text before the cursor.
const matchBeforeCursor = (text: string, regex = URL_BEFORE_CURSOR_REGEX) => {
  const match = text.match(regex);
  return match ? match[0].replace(/^\s+/, '') : null;
};
const matchEmail = (text: string) => matchBeforeCursor(text, EMAIL_BEFORE_CURSOR_REGEX);

describe('composer URL autolinking', () => {
  it('links a URL followed by a closing parenthesis and keeps the parenthesis as text', () => {
    const matched = matchBeforeCursor('(see https://example.com/page)');
    expect(splitTrailingPunctuation(matched)).toEqual({
      leading: '',
      link: 'https://example.com/page',
      trailing: ')',
    });
  });

  it('links a URL followed by sentence punctuation', () => {
    expect(splitTrailingPunctuation(matchBeforeCursor('go to https://example.com.'))).toEqual({
      leading: '',
      link: 'https://example.com',
      trailing: '.',
    });
    expect(splitTrailingPunctuation(matchBeforeCursor('https://example.com/a?b=c),'))).toEqual({
      leading: '',
      link: 'https://example.com/a?b=c',
      trailing: '),',
    });
  });

  it('still links a URL with nothing after it', () => {
    expect(splitTrailingPunctuation(matchBeforeCursor('plain https://example.com'))).toEqual({
      leading: '',
      link: 'https://example.com',
      trailing: '',
    });
  });

  it('does not match text without a URL', () => {
    expect(matchBeforeCursor('no url here)')).toBe(null);
  });
});

describe('composer email autolinking', () => {
  it('links an email followed by sentence punctuation', () => {
    expect(splitEmailPunctuation(matchEmail('Email me at bob@example.com.'))).toEqual({
      leading: '',
      link: 'bob@example.com',
      trailing: '.',
    });
    expect(splitEmailPunctuation(matchEmail('bob@example.com,'))).toEqual({
      leading: '',
      link: 'bob@example.com',
      trailing: ',',
    });
  });

  it('links an email wrapped in parentheses or quotes and keeps them as text', () => {
    expect(splitEmailPunctuation(matchEmail('write to (bob@example.com)'))).toEqual({
      leading: '(',
      link: 'bob@example.com',
      trailing: ')',
    });
    expect(splitEmailPunctuation(matchEmail('"bob@example.com"'))).toEqual({
      leading: '"',
      link: 'bob@example.com',
      trailing: '"',
    });
  });

  it('still links a plain email and ignores emails inside words', () => {
    expect(splitEmailPunctuation(matchEmail('hi bob@example.com'))).toEqual({
      leading: '',
      link: 'bob@example.com',
      trailing: '',
    });
    expect(matchEmail('https://user@example.com/a')).toBe(null);
    expect(matchEmail('no email here.')).toBe(null);
  });
});
