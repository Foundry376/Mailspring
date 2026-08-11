// Templates are stored as plain HTML files in the templates folder so they stay
// easy to read, edit and share. To keep a template a single self-contained file,
// the subject line is stored in a <meta> tag at the top of the document instead
// of in a sidecar file:
//
//   <meta name="subject" content="Following up on our call"/>
//   <div>Hey {{first_name}}, ...</div>
//
// Templates written before subject support existed simply have no meta tag and
// parse to an empty subject.
const SUBJECT_META_REGEX =
  /^\s*<meta\s+name=["']?subject["']?\s+content=(?:"([^"]*)"|'([^']*)')\s*\/?>[^\S\n]*\n?/i;

export interface ParsedTemplate {
  subject: string;
  body: string;
}

function escapeAttributeValue(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeAttributeValue(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Split the contents of a template file into its subject line and message body.
 * Files without a subject meta tag return an empty subject and untouched body.
 */
export function parseTemplate(contents: string): ParsedTemplate {
  const match = SUBJECT_META_REGEX.exec(contents || '');
  if (!match) {
    return { subject: '', body: contents || '' };
  }
  const rawSubject = match[1] !== undefined ? match[1] : match[2];
  return {
    subject: unescapeAttributeValue(rawSubject).trim(),
    body: (contents || '').substr(match[0].length),
  };
}

/**
 * Serialize a subject and body back into the contents of a template file. The
 * meta tag is omitted entirely when the template has no subject, so templates
 * you never give a subject to look exactly like they always have.
 */
export function stringifyTemplate({ subject, body }: ParsedTemplate): string {
  const cleanSubject = (subject || '').trim();
  if (!cleanSubject) {
    return body || '';
  }
  return `<meta name="subject" content="${escapeAttributeValue(cleanSubject)}"/>\n${body || ''}`;
}
