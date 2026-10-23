import {
  URL_BEFORE_CURSOR_REGEX,
  splitTrailingPunctuation,
} from '../../../src/components/composer-editor/link-plugins';

// slate-auto-replace runs String.match(before) on the text before the cursor.
const matchBeforeCursor = (text: string) => {
  const match = text.match(URL_BEFORE_CURSOR_REGEX);
  return match ? match[0].replace(/^\s+/, '') : null;
};

describe('composer URL autolinking', () => {
  it('links a URL followed by a closing parenthesis and keeps the parenthesis as text', () => {
    const matched = matchBeforeCursor('(see https://example.com/page)');
    expect(splitTrailingPunctuation(matched)).toEqual({
      link: 'https://example.com/page',
      trailing: ')',
    });
  });

  it('links a URL followed by sentence punctuation', () => {
    expect(splitTrailingPunctuation(matchBeforeCursor('go to https://example.com.'))).toEqual({
      link: 'https://example.com',
      trailing: '.',
    });
    expect(splitTrailingPunctuation(matchBeforeCursor('https://example.com/a?b=c),'))).toEqual({
      link: 'https://example.com/a?b=c',
      trailing: '),',
    });
  });

  it('still links a URL with nothing after it', () => {
    expect(splitTrailingPunctuation(matchBeforeCursor('plain https://example.com'))).toEqual({
      link: 'https://example.com',
      trailing: '',
    });
  });

  it('does not match text without a URL', () => {
    expect(matchBeforeCursor('no url here)')).toBe(null);
  });
});
