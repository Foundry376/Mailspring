import { RegExpUtils } from 'mailspring-exports';

export function currentSignatureId(body) {
  let replyEnd = body.search(RegExpUtils.n1QuoteStartRegex());
  if (replyEnd === -1) {
    replyEnd = body.length;
  }

  const signatureRegex = /<signature id="([A-Za-z0-9-/\\]+)">/;
  const signatureMatch = signatureRegex.exec(body.substr(0, replyEnd));
  return signatureMatch && signatureMatch[1];
}

export function applySignature(body, signature) {
  const signatureRegex = /<p><signature id="[A-Za-z0-9-/\\]+">[^]*<\/signature> ?<\/p>/;

  // Remove any existing signature in the body
  let newBody = body;
  if (currentSignatureId(body)) {
    newBody = newBody.replace(signatureRegex, '');
  }

  // http://www.regexpal.com/?fam=94390
  // prefer to put the signature one <br> before the beginning of the quote,
  // if possible.
  let insertionPoint = newBody.search(RegExpUtils.n1QuoteStartRegex());
  if (insertionPoint === -1) {
    insertionPoint = newBody.length;
  }

  if (signature) {
    const contentBefore = newBody.slice(0, insertionPoint);
    const contentAfter = newBody.slice(insertionPoint);
    return `${contentBefore}<p><signature id="${signature.id}">${signature.body}</signature></p>${contentAfter}`;
  } else {
    return newBody;
  }
}
