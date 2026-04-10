/**
 * Generate a safe default .eml filename from a message subject.
 *
 * This is only used for save-dialog defaults and temp filenames on the client.
 * The backend (GetManyRFC2822Task) owns the more complex indexed filename
 * format used during bulk folder export.
 */
export function defaultEmlFilename(subject: string): string {
  let name = (subject || '').trim();
  if (name.length === 0) {
    name = 'untitled';
  }
  if (name.length > 80) {
    name = name.substring(0, 80);
  }
  name = name.replace(/[/?<>\\:*|"]/g, '_');
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, '');
  name = name.replace(/[.\s]+$/, '');
  return `${name}.eml`;
}
