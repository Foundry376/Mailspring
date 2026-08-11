import { parseTemplate, stringifyTemplate } from '../lib/template-file';

describe('template-file', function templateFile() {
  describe('parseTemplate', () => {
    it('returns an empty subject for templates without a meta tag', () => {
      const body = '<div>Hello world</div>';
      expect(parseTemplate(body)).toEqual({ subject: '', body });
    });

    it('returns an empty subject and body for empty contents', () => {
      expect(parseTemplate('')).toEqual({ subject: '', body: '' });
      expect(parseTemplate(undefined)).toEqual({ subject: '', body: '' });
    });

    it('extracts the subject and strips the meta tag from the body', () => {
      const { subject, body } = parseTemplate(
        '<meta name="subject" content="Following up"/>\n<div>Hello world</div>'
      );
      expect(subject).toBe('Following up');
      expect(body).toBe('<div>Hello world</div>');
    });

    it('accepts single quotes, no quotes around the name and no self-closing slash', () => {
      const { subject, body } = parseTemplate(
        "<meta name=subject content='Following up'><div>Hello</div>"
      );
      expect(subject).toBe('Following up');
      expect(body).toBe('<div>Hello</div>');
    });

    it('unescapes entities in the subject', () => {
      const { subject } = parseTemplate(
        '<meta name="subject" content="Ben &amp; Jerry&#39;s &quot;best&quot; &lt;flavors&gt;"/>'
      );
      expect(subject).toBe('Ben & Jerry\'s "best" <flavors>');
    });

    it('does not treat a meta tag in the middle of the body as the subject', () => {
      const body = '<div>Hi</div><meta name="subject" content="Nope"/>';
      expect(parseTemplate(body)).toEqual({ subject: '', body });
    });
  });

  describe('stringifyTemplate', () => {
    it('writes the body unchanged when there is no subject', () => {
      expect(stringifyTemplate({ subject: '', body: '<div>Hi</div>' })).toBe('<div>Hi</div>');
      expect(stringifyTemplate({ subject: '   ', body: '<div>Hi</div>' })).toBe('<div>Hi</div>');
    });

    it('prepends a meta tag when there is a subject', () => {
      expect(stringifyTemplate({ subject: 'Following up', body: '<div>Hi</div>' })).toBe(
        '<meta name="subject" content="Following up"/>\n<div>Hi</div>'
      );
    });

    it('escapes entities in the subject', () => {
      expect(stringifyTemplate({ subject: 'Ben & Jerry\'s "best"', body: '' })).toBe(
        '<meta name="subject" content="Ben &amp; Jerry\'s &quot;best&quot;"/>\n'
      );
    });

    it('round-trips subjects containing markup and quotes', () => {
      const template = { subject: 'A <b>bold</b> & "quoted" subject', body: '<div>Hi</div>' };
      expect(parseTemplate(stringifyTemplate(template))).toEqual(template);
    });
  });
});
