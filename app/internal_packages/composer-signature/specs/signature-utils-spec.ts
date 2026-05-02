import { currentSignatureId, applySignature } from '../lib/signature-utils';

const QUOTE_START = '<div class="gmail_quote">On Mon, Jan 1 wrote:</div>';

const sig = (id: string, body: string) => `<signature id="${id}">${body}</signature>`;

describe('signature-utils', function () {
  describe('currentSignatureId', function () {
    it('returns the signature id when a signature tag is present', function () {
      const body = `<div>Hello world</div>${sig('sig-abc', '<p>Thanks</p>')}`;
      expect(currentSignatureId(body)).toEqual('sig-abc');
    });

    it('returns null when no signature tag is present', function () {
      const body = '<div>Hello world</div>';
      expect(currentSignatureId(body)).toBeFalsy();
    });

    it('returns null when the signature appears after the quote start', function () {
      // The signature is inside the quoted reply, so it should be ignored
      const body = `<div>My reply</div>${QUOTE_START}${sig('sig-quoted', '<p>Old sig</p>')}`;
      expect(currentSignatureId(body)).toBeFalsy();
    });

    it('returns the id when the signature appears before the quote start', function () {
      const body = `<div>My reply</div>${sig('sig-before-quote', '<p>Cheers</p>')}${QUOTE_START}`;
      expect(currentSignatureId(body)).toEqual('sig-before-quote');
    });
  });

  describe('applySignature', function () {
    it('adds a signature to an empty body', function () {
      const result = applySignature('', { id: 'sig-1', body: '<p>Regards</p>' });
      expect(result).toContain('<signature id="sig-1"><p>Regards</p></signature>');
    });

    it('includes the correct signature id and body content', function () {
      const result = applySignature('<div>Hi</div>', { id: 'my-sig', body: '<b>Alice</b>' });
      expect(result).toContain('<signature id="my-sig"><b>Alice</b></signature>');
    });

    it('inserts the signature before the quoted reply', function () {
      const body = `<div>Hi there</div>${QUOTE_START}`;
      const result = applySignature(body, { id: 'sig-1', body: '<p>Thanks</p>' });
      const sigIndex = result.indexOf('<signature');
      const quoteIndex = result.indexOf(QUOTE_START);
      expect(sigIndex).toBeGreaterThan(-1);
      expect(sigIndex).toBeLessThan(quoteIndex);
    });

    it('preserves the quoted reply after the signature', function () {
      const body = `<div>Hi there</div>${QUOTE_START}`;
      const result = applySignature(body, { id: 'sig-1', body: '<p>Thanks</p>' });
      expect(result).toContain(QUOTE_START);
      const sigEnd = result.indexOf('</signature>');
      const quoteIndex = result.indexOf(QUOTE_START);
      expect(quoteIndex).toBeGreaterThan(sigEnd);
    });

    it('replaces an existing signature instead of adding a second one', function () {
      const body = `<div>Hi</div>${sig('old-sig', '<p>Old</p>')}`;
      const result = applySignature(body, { id: 'new-sig', body: '<p>New</p>' });
      expect(result).toContain('<signature id="new-sig"><p>New</p></signature>');
      expect(result).not.toContain('old-sig');
      const count = (result.match(/<signature/g) || []).length;
      expect(count).toEqual(1);
    });

    it('does not add extra whitespace when replacing an existing signature', function () {
      const body = `<div>Hi</div>${sig('old-sig', '<p>Old</p>')}`;
      const result = applySignature(body, { id: 'new-sig', body: '<p>New</p>' });
      // When replacing, additionalWhitespace is '' so there should be no <br/> injected
      // between the content before and the new signature
      expect(result).toContain('</div><signature id="new-sig">');
    });

    it('removes the signature when signature arg is null', function () {
      const body = `<div>Hi</div>${sig('sig-1', '<p>Cheers</p>')}`;
      const result = applySignature(body, null);
      expect(result).not.toContain('<signature');
      expect(result).not.toContain('sig-1');
    });

    it('removes the signature when signature arg is falsy', function () {
      const body = `<div>Hi</div>${sig('sig-1', '<p>Cheers</p>')}`;
      const result = applySignature(body, undefined);
      expect(result).not.toContain('<signature');
    });

    it('adds a <br/> spacer before the signature when the body has no trailing BRs', function () {
      const body = '<div>Some content</div>';
      const result = applySignature(body, { id: 'sig-1', body: '<p>Thanks</p>' });
      expect(result).toContain('<br/><signature id="sig-1">');
    });

    it('does not add extra whitespace when the body already has two or more trailing BRs', function () {
      const body = '<div>Some content</div><br/><br/>';
      const result = applySignature(body, { id: 'sig-1', body: '<p>Thanks</p>' });
      // numberOfTrailingBRs > 1, so no additional <br/> is added — the signature
      // appears directly after the existing trailing BRs without an extra one
      expect(result).toBe(
        '<div>Some content</div><br/><br/><signature id="sig-1"><p>Thanks</p></signature>'
      );
      // Confirm no triple <br/> was inserted
      expect(result).not.toContain('<br/><br/><br/>');
    });

    it('does not add extra whitespace when the body has two trailing <div></div> elements', function () {
      const body = '<div>Content</div><div></div><div></div>';
      const result = applySignature(body, { id: 'sig-1', body: '<p>Regards</p>' });
      // Should not have an additional <br/> before signature
      expect(result).toBe(
        '<div>Content</div><div></div><div></div><signature id="sig-1"><p>Regards</p></signature>'
      );
    });

    it('returns the body unchanged when signature is falsy and no existing signature', function () {
      const body = '<div>No sig here</div>';
      const result = applySignature(body, null);
      expect(result).toEqual(body);
    });
  });
});
