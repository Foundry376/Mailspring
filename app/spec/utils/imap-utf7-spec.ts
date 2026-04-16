import { imapUtf7 } from '../../src/utils/imap-utf7';

describe('imapUtf7', () => {
  describe('encode', () => {
    it('passes through empty string', () => {
      expect(imapUtf7.encode('')).toEqual('');
    });

    it('passes through pure printable ASCII unchanged', () => {
      expect(imapUtf7.encode('Inbox')).toEqual('Inbox');
      expect(imapUtf7.encode('INBOX/Sent')).toEqual('INBOX/Sent');
      expect(imapUtf7.encode(' !"#$%\'()*+,-./:;<=>?@[\\]^_`{|}~')).toEqual(
        ' !"#$%\'()*+,-./:;<=>?@[\\]^_`{|}~'
      );
    });

    it('encodes & as &-', () => {
      expect(imapUtf7.encode('&')).toEqual('&-');
      expect(imapUtf7.encode('A&B')).toEqual('A&-B');
      expect(imapUtf7.encode('&&')).toEqual('&-&-');
    });

    it('encodes accented characters', () => {
      expect(imapUtf7.encode('Ö')).toEqual('&ANY-');
      expect(imapUtf7.encode('Küche')).toEqual('K&APw-che');
      expect(imapUtf7.encode('Öffentlich')).toEqual('&ANY-ffentlich');
    });

    it('encodes CJK characters', () => {
      expect(imapUtf7.encode('日本語')).toEqual('&ZeVnLIqe-');
    });

    it('encodes mixed ASCII and non-ASCII', () => {
      expect(imapUtf7.encode('INBOX/Küche')).toEqual('INBOX/K&APw-che');
      expect(imapUtf7.encode('A Ö B')).toEqual('A &ANY- B');
    });

    it('encodes & followed immediately by non-ASCII', () => {
      expect(imapUtf7.encode('&Ö')).toEqual('&-&ANY-');
    });

    it('encodes surrogate pairs (non-BMP characters)', () => {
      expect(imapUtf7.encode('😀')).toEqual('&2D3eAA-');
    });

    it('encodes consecutive non-ASCII runs as single escape sequence', () => {
      // Two adjacent non-ASCII chars form one run, not two separate sequences
      const encoded = imapUtf7.encode('ÖÄ');
      expect(encoded).toEqual('&ANYAxA-');
    });
  });

  describe('decode', () => {
    it('passes through empty string', () => {
      expect(imapUtf7.decode('')).toEqual('');
    });

    it('passes through pure ASCII unchanged', () => {
      expect(imapUtf7.decode('Inbox')).toEqual('Inbox');
      expect(imapUtf7.decode('INBOX/Sent')).toEqual('INBOX/Sent');
    });

    it('decodes &- as &', () => {
      expect(imapUtf7.decode('&-')).toEqual('&');
      expect(imapUtf7.decode('A&-B')).toEqual('A&B');
      expect(imapUtf7.decode('&-&-')).toEqual('&&');
    });

    it('decodes accented characters', () => {
      expect(imapUtf7.decode('&ANY-')).toEqual('Ö');
      expect(imapUtf7.decode('K&APw-che')).toEqual('Küche');
      expect(imapUtf7.decode('&ANY-ffentlich')).toEqual('Öffentlich');
    });

    it('decodes CJK characters', () => {
      expect(imapUtf7.decode('&ZeVnLIqe-')).toEqual('日本語');
    });

    it('decodes surrogate pairs', () => {
      expect(imapUtf7.decode('&2D3eAA-')).toEqual('😀');
    });
  });

  describe('round-trip', () => {
    const cases = [
      '',
      'Inbox',
      '&',
      'A&B',
      'Ö',
      'Küche',
      '日本語',
      'INBOX/Küche',
      '&Ö',
      '😀',
      'Mixed: A&B with Ö and 日',
    ];

    for (const str of cases) {
      it(`decode(encode(str)) === str for: ${JSON.stringify(str)}`, () => {
        expect(imapUtf7.decode(imapUtf7.encode(str))).toEqual(str);
      });
    }
  });
});
