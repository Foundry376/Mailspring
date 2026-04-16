/**
 * RFC 3501 §5.1.3 IMAP modified UTF-7 encode/decode.
 *
 * Replaces the 'utf7' npm package (v1.0.1) which has a broken Node.js version
 * check. It uses a lexicographic string comparison:
 *
 *   if (process.version >= 'v6.0.0') { Buffer.alloc(...) }
 *   else                             { new Buffer(...) }  // deprecated
 *
 * Because 'v10.0.0' < 'v6.0.0' lexicographically ('1' < '6'), Electron's
 * embedded Node.js v10+ always falls into the else-branch. Modern Node.js
 * then throws: "The 'string' argument must be of type string. Received type
 * number (N)" when new Buffer(size, encoding) is called with a numeric first
 * argument — meaning every folder name that contains a non-ASCII character
 * crashes on create or rename.
 */

function encodeChunk(chunk: string): string {
  // Convert to UTF-16BE bytes, then Modified Base64 ('/' → ',', no padding).
  const buf = Buffer.allocUnsafe(chunk.length * 2);
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk.charCodeAt(i);
    buf[i * 2] = c >> 8;
    buf[i * 2 + 1] = c & 0xff;
  }
  return buf.toString('base64').replace(/\//g, ',').replace(/=+$/, '');
}

function decodeChunk(b64: string): string {
  // Swap ',' back to '/', base64-decode to UTF-16BE bytes, build string.
  const buf = Buffer.from(b64.replace(/,/g, '/'), 'base64');
  let result = '';
  for (let i = 0; i + 1 < buf.length; i += 2) {
    result += String.fromCharCode((buf[i] << 8) | buf[i + 1]);
  }
  return result;
}

export const imapUtf7 = {
  /**
   * Encode a Unicode string to IMAP modified UTF-7 (RFC 3501 §5.1.3).
   * Printable ASCII (0x20–0x7E) passes through unchanged except '&' → '&-'.
   * Runs of non-representable characters become '&<ModifiedBase64>-'.
   */
  encode(str: string): string {
    return str
      .replace(/&/g, '&-')
      .replace(/[^\x20-\x7e]+/g, chunk => `&${encodeChunk(chunk)}-`);
  },

  /**
   * Decode an IMAP modified UTF-7 string (RFC 3501 §5.1.3) to Unicode.
   */
  decode(str: string): string {
    return str.replace(/&([^-]*)-/g, (_, chunk) => {
      if (chunk === '') return '&';
      return decodeChunk(chunk);
    });
  },
};

export default imapUtf7;
