import { displayNameForContact, initialsForContact } from '../lib/ContactDisplayName';

describe('displayNameForContact', function () {
  const email = 'lloyd@example.com';

  it('returns an ordinary name unchanged', () => {
    expect(displayNameForContact({ name: 'Lloyd Smith', email })).toBe('Lloyd Smith');
  });

  it('strips quotes that were inside an encoded-word display name', () => {
    expect(displayNameForContact({ name: '"Verónica Achá"', email })).toBe('Verónica Achá');
  });

  it('falls back to the email when the name is the bracketed address', () => {
    expect(displayNameForContact({ name: '<Lloyd@example.com>', email })).toBe(email);
  });

  it('falls back to the email when the name has no letters or digits', () => {
    expect(displayNameForContact({ name: ')', email })).toBe(email);
    expect(displayNameForContact({ name: ';;;;', email })).toBe(email);
  });

  it('keeps names in non-Latin scripts', () => {
    expect(displayNameForContact({ name: '王小明', email })).toBe('王小明');
  });

  it('returns a placeholder when there is neither a name nor an email', () => {
    expect(displayNameForContact({ name: ';;;;', email: '' })).toBe('No Name');
  });
});

describe('initialsForContact', function () {
  it('uses the first letters of the first two words of the name', () => {
    expect(initialsForContact({ name: 'Verónica Achá Alvarez', email: 'v@example.com' })).toBe(
      'VA'
    );
  });

  it('ignores punctuation in the name', () => {
    expect(initialsForContact({ name: '[unclan] Rhino', email: 'r@example.com' })).toBe('UR');
  });

  it('is empty when there is neither a name nor an email', () => {
    expect(initialsForContact({ name: '', email: '' })).toBe('');
  });

  it('uses one letter from the email when there is no usable name', () => {
    expect(initialsForContact({ name: '<agnes@example.com>', email: 'agnes@example.com' })).toBe(
      'A'
    );
  });
});
