import { RegExpUtils } from 'mailspring-exports';

function numberOfTrailingBRs(text) {
  let count = 0;
  text = text.trim();
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

export function currentSignatureId(body) {
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

    return `${contentBefore}${additionalWhitespace}<signature id="${signature.id}">${
      signature.body
    }</signature>${contentAfter}`;
  } else {
    return newBody;
  }
}
