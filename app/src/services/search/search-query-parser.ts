import {
  SearchQueryToken,
  OrQueryExpression,
  NotQueryExpression,
  AndQueryExpression,
  FromQueryExpression,
  ToQueryExpression,
  SubjectQueryExpression,
  GenericQueryExpression,
  TextQueryExpression,
  UnreadStatusQueryExpression,
  StarredStatusQueryExpression,
  DateQueryExpression,
  InQueryExpression,
  HasAttachmentQueryExpression,
  QueryExpression,
} from './search-query-ast';

const nextStringToken = (text: string): [SearchQueryToken, string] => {
  if (text[0] !== '"') {
    throw new Error('Expected string token to begin with double quote (")');
  }
  if (text.length < 2) {
    throw new Error('Expected string but ran out of input');
  }
  let pos = 1;
  while (pos < text.length) {
    const c = text[pos];
    if (c === '"') {
      return [new SearchQueryToken(text.substring(1, pos)), text.substring(pos + 1)];
    }
    pos += 1;
  }
  throw new Error('Expected string but ran out of input');
};

const isWhitespace = c => {
  switch (c) {
    case ' ':
    case '\t':
    case '\n':
      return true;
    default:
      return false;
  }
};

const consumeWhitespace = (text: string) => {
  let pos = 0;
  while (pos < text.length && isWhitespace(text[pos])) {
    pos += 1;
  }
  return text.substring(pos);
};

const reserved = [
  '(',
  ')',
  ':',
  'is',
  'read',
  'unread',
  'starred',
  'and',
  'or',
  'from',
  'to',
  'subject',
  'in',
  'has',
  'attachment',
  'before',
  'since',
  'after',
  'not',
];

const mightBeReserved = (text: string) => {
  for (const r of reserved) {
    if (r.startsWith(text) || r.toUpperCase().startsWith(text)) {
      return true;
    }
  }
  return false;
};

const isValidNonStringChar = (c: string) => {
  switch (c) {
    case '(':
    case ')':
    case ':':
      return false;
    default:
      return !isWhitespace(c);
  }
};

const isValidNonStringText = (text: string) => {
  if (text.length < 1) {
    return false;
  }

  for (const c of text) {
    if (!isValidNonStringChar(c)) {
      return false;
    }
  }
  return true;
};

const nextToken = (text: string): [SearchQueryToken, string] => {
  const newText = consumeWhitespace(text);
  if (newText.length === 0) {
    return [null, newText];
  }

  if (newText[0] === '"') {
    return nextStringToken(newText);
  }

  let isReserved = true;
  let pos = 0;
  while (pos < newText.length) {
    if (isWhitespace(newText[pos])) {
      return [new SearchQueryToken(newText.substring(0, pos)), newText.substring(pos)];
    }

    const curr = newText.substring(0, pos + 1);
    if (isReserved) {
      // We no longer have a reserved keyword.
      if (!mightBeReserved(curr)) {
        // We became an invalid non-reserved token so return the previous pos.
        if (!isValidNonStringText(curr)) {
          return [new SearchQueryToken(newText.substring(0, pos)), newText.substring(pos)];
        }
        // We're still a valid token but we're no longer reserved.
        isReserved = false;
      }
    } else {
      // We're not reserved and we become invalid so go back.
      if (!isReserved && !isValidNonStringText(curr)) {
        return [new SearchQueryToken(newText.substring(0, pos)), newText.substring(pos)];
      }
    }
    pos += 1;
  }
  return [new SearchQueryToken(newText.substring(0, pos + 1)), newText.substring(pos + 1)];
};

/*
 * query: and_query+
 *
 * and_query: or_query [and_query_rest]
 * and_query_rest: AND and_query
 *
 * or_query: simple_query [or_query_rest]
 * or_query_rest: OR or_query
 *
 * simple_query: TEXT
 *             | from_query
 *             | to_query
 *             | subject_query
 *             | paren_query
 *             | is_query
 *             | has_query
 *
 * from_query: FROM COLON TEXT
 * to_query: TO COLON TEXT
 * subject_query: SUBJECT COLON TEXT
 * paren_query: LPAREN query RPAREN
 * is_query: IS COLON is_query_rest
 * is_query_rest: read_cond
 *              | starred_cond
 * has_query: HAS COLON ATTACHMENT
 * read_cond: READ | UNREAD
 * starred_cond: STARRED | UNSTARRED
 * in_query: IN COLON TEXT
 *
 * TEXT: STRING
 *     | [^\s]+
 * STRING: DQUOTE [^"]* DQUOTE
 */
const consumeExpectedToken = (text: string, token: string) => {
  const [tok, afterTok] = nextToken(text);
  if (tok.s !== token) {
    throw new Error(`Expected '${token}', got '${tok.s}'`);
  }
  return afterTok;
};

const parseText = (text: string): [QueryExpression, string] => {
  const [tok, afterTok] = nextToken(text);
  if (tok === null) {
    throw new Error('Expected text but none available');
  }
  return [new TextQueryExpression(tok), afterTok];
};

const parseIsQuery = (text: string): [QueryExpression, string] => {
  const afterColon = consumeExpectedToken(text, ':');
  const [tok, afterTok] = nextToken(afterColon);
  if (tok === null) {
    return null;
  }
  const tokText = tok.s.toUpperCase();
  switch (tokText) {
    case 'READ':
    case 'UNREAD': {
      return [new UnreadStatusQueryExpression(tokText === 'UNREAD'), afterTok];
    }
    case 'STARRED':
    case 'UNSTARRED': {
      return [new StarredStatusQueryExpression(tokText === 'STARRED'), afterTok];
    }
    default:
      break;
  }
  return null;
};

const parseHasQuery = (text: string): [QueryExpression, string] => {
  const afterColon = consumeExpectedToken(text, ':');
  const [tok, afterTok] = nextToken(afterColon);
  if (tok === null) {
    return null;
  }
  const tokText = tok.s.toUpperCase();
  switch (tokText) {
    case 'ATTACHMENT':
    case 'ATTACHMENTS': {
      return [new HasAttachmentQueryExpression(), afterTok];
    }
    default:
      break;
  }
  return null;
};

const parseSimpleQuery = (text: string): [QueryExpression, string] => {
  const [tok, afterTok] = nextToken(text);
  if (tok === null) {
    return [null, afterTok];
  }
  if (tok.s === '(') {
    const [exp, afterExp] = parseQuery(afterTok);
    const afterRparen = consumeExpectedToken(afterExp, ')');
    return [exp, afterRparen];
  }

  if (tok.s.toUpperCase() === 'TO') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new ToQueryExpression(txt), afterTxt];
  }

  if (tok.s.toUpperCase() === 'FROM') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new FromQueryExpression(txt), afterTxt];
  }

  if (tok.s.toUpperCase() === 'SUBJECT') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new SubjectQueryExpression(txt), afterTxt];
  }

  if (tok.s.toUpperCase() === 'IS') {
    const result = parseIsQuery(afterTok);
    if (result !== null) {
      return result;
    }
  }

  if (tok.s.toUpperCase() === 'HAS') {
    const result = parseHasQuery(afterTok);
    if (result !== null) {
      return result;
    }
  }

  if (tok.s.toUpperCase() === 'SINCE' || tok.s.toUpperCase() === 'AFTER') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new DateQueryExpression(txt, 'after'), afterTxt];
  }

  if (tok.s.toUpperCase() === 'BEFORE') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new DateQueryExpression(txt, 'before'), afterTxt];
  }

  if (tok.s.toUpperCase() === 'IN') {
    const afterColon = consumeExpectedToken(afterTok, ':');
    const [txt, afterTxt] = parseText(afterColon);
    return [new InQueryExpression(txt), afterTxt];
  }

  const [txt, afterTxt] = parseText(text);
  return [new GenericQueryExpression(txt), afterTxt];
};

const parseOrQuery = (text: string): [QueryExpression, string] => {
  const [lhs, afterLhs] = parseSimpleQuery(text);
  const [tok, afterOr] = nextToken(afterLhs);
  if (tok === null) {
    return [lhs, afterLhs];
  }
  if (tok.s.toUpperCase() !== 'OR') {
    return [lhs, afterLhs];
  }
  const [rhs, afterRhs] = parseOrQuery(afterOr);
  return [new OrQueryExpression(lhs, rhs), afterRhs];
};

const parseAndQuery = (text: string): [QueryExpression, string] => {
  const [lhs, afterLhs] = parseOrQuery(text);
  let [tok, afterTok] = nextToken(afterLhs);
  if (tok === null) {
    return [lhs, afterLhs];
  }
  // Ben Edit: within a search group eg (test is:unread), we assume tokens (eg is:)
  // are separated by an implicit AND when one is not present. The only things that
  // break us out of the AND query are a close paren or an explicit OR token.
  if (tok.s.toUpperCase() === 'OR' || tok.s.toUpperCase() === ')') {
    return [lhs, afterLhs];
  } else {
    let rhsStart = afterLhs;
    if (tok.s.toUpperCase() === 'AND') {
      rhsStart = afterTok;
      [tok, afterTok] = nextToken(afterTok);
    }
    if (tok.s.toUpperCase() === 'NOT') {
      rhsStart = afterTok;
      const [rhs, afterRhs] = parseAndQuery(rhsStart);
      return [new NotQueryExpression(lhs, rhs), afterRhs];
    } else {
      const [rhs, afterRhs] = parseAndQuery(rhsStart);
      return [new AndQueryExpression(lhs, rhs), afterRhs];
    }
  }

  // NOTE: There is a bug in here somewhere where an entire match-based clause NOT'd with
  // a WHERE-based claused has the wrong precedence. For example:
  //
  // is:unread NOT hello AND in:inbox
  //
  // is interpreted as:
  //
  // is:unread (NOT hello AND in:inbox)
  //
  // but typically the NOT should only apply to the very next clause... tbd how to fix.
};

const parseQuery = (text: string) => {
  return parseAndQuery(text);
};

const parseQueryWrapper = (text: string) => {
  let currText = text;
  const exps = [];
  while (currText.length > 0) {
    const [result, leftover] = parseQuery(currText);
    if (result === null) {
      break;
    }
    exps.push(result);
    currText = leftover;
  }

  if (exps.length === 0) {
    throw new Error('Unable to parse query');
  }

  let result: QueryExpression = null;
  for (let i = exps.length - 1; i >= 0; --i) {
    if (result === null) {
      result = exps[i];
    } else {
      result = new AndQueryExpression(exps[i], result);
    }
  }
  return result;
};

export class SearchQueryParser {
  static parse(query: string) {
    return parseQueryWrapper(query);
  }
}
