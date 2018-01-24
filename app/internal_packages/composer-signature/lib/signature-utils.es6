import { RegExpUtils } from 'mailspring-exports';

export function currentSignatureId(body) {
  let replyEnd = body.search(RegExpUtils.nativeQuoteStartRegex());
  if (replyEnd === -1) {
    replyEnd = body.length;
  }

  const signatureRegex = /<signature id="([A-Za-z0-9-/\\]+)">/;
  const signatureMatch = signatureRegex.exec(body.substr(0, replyEnd));
  return signatureMatch && signatureMatch[1];
}

export function applySignature(body, signature) {
  let additionalWhitespace = '<br/>';

  // Remove any existing signature in the body
  let newBody = body;
  if (currentSignatureId(body)) {
    newBody = newBody.replace(/<signature id="[A-Za-z0-9-/\\]+">[^]*<\/signature>/, '');
    additionalWhitespace = '';
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
    return `${contentBefore}${additionalWhitespace}<signature id="${signature.id}">${
      signature.body
    }</signature>${contentAfter}`;
  } else {
    return newBody;
  }
}
