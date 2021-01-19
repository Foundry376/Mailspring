import { RegExpUtils } from 'mailspring-exports';
import { Value } from 'slate';

function numberOfTrailingBRs(text) {
  let count = 0;
  text = text.trim();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (text.endsWith('<br/>')) {
      text = text.substr(0, text.length - 5);
    } else if (text.endsWith('<div></div>')) {
      text = text.substr(0, text.length - 11);
    } else {
      break;
    }
    text = text.trim();
    count++;
  }
  return count;
}

export function currentSignatureIdSlate(value: Value) {
  const sigNode = value.document
    .getBlocksByType('uneditable')
    .toArray()
    .find(a => a.data.get('html').startsWith('<signature '));
  if (!sigNode) return null;

  const signatureRegex = RegExpUtils.mailspringSignatureRegex();
  const signatureMatch = signatureRegex.exec(sigNode.data.get('html'));
  return signatureMatch && signatureMatch[1];
}

export function currentSignatureId(body: string) {
  let replyEnd = body.search(RegExpUtils.nativeQuoteStartRegex());
  if (replyEnd === -1) {
    replyEnd = body.length;
  }

  const signatureRegex = RegExpUtils.mailspringSignatureRegex();
  const signatureMatch = signatureRegex.exec(body.substr(0, replyEnd));
  return signatureMatch && signatureMatch[1];
}

export function applySignature(body, signature) {
  // Remove any existing signature in the body
  let additionalWhitespace = '<br/>';

  let newBody = body;
  if (currentSignatureId(body)) {
    newBody = newBody.replace(RegExpUtils.mailspringSignatureRegex(), '');
    additionalWhitespace = ''; // never add whitespace when switching signatures
  }

  // http://www.regexpal.com/?fam=94390
  // prefer to put the signature one <br> before the beginning of the quote,
  // if possible.
  let insertionPoint = newBody.search(RegExpUtils.nativeQuoteStartRegex());
  if (insertionPoint === -1) {
    insertionPoint = newBody.length;
  }

  if (signature) {
    const contentBefore = newBody.slice(0, insertionPoint);
    const contentAfter = newBody.slice(insertionPoint);
    if (numberOfTrailingBRs(contentBefore) > 1) {
      additionalWhitespace = ''; // never add whitespace when we already have 2 spaces
    }

    return `${contentBefore}${additionalWhitespace}<signature id="${signature.id}">${signature.body}</signature>${contentAfter}`;
  } else {
    return newBody;
  }
}
