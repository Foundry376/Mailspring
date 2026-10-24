import {
  AndQueryExpression,
  OrQueryExpression,
  NotQueryExpression,
  InQueryExpression,
  DateQueryExpression,
  QueryExpression,
  SearchQueryExpressionVisitor,
} from './search-query-ast';
import { Account } from '../../flux/models/account';
import { Category } from '../../flux/models/category';
import DateUtils from '../../date-utils';
import { imapUtf7 } from '../../utils/imap-utf7';

/*
 * A `search-remote` request for the sync engine (Mailspring-Sync SearchWorker): `criteria`
 * is the engine's IMAP SEARCH grammar, `gmailRaw` a Gmail web search string run as X-GM-RAW,
 * and `folderIds` the folders to search instead of the engine's default.
 */
export interface RemoteSearchRequest {
  criteria?: unknown[];
  gmailRaw?: string;
  folderIds?: string[];
}

class Unsupported extends Error {}

const textOf = (node: any): string => node.text.token.s;

const dateOf = (node: DateQueryExpression): Date | null =>
  DateUtils.getChronoPast().parseDate(textOf(node));

// IMAP dates have no time or zone (RFC 3501 6.4.4), so a bound becomes the day it falls on.
// The server can match up to a day more than the local search does; results are a union.
const imapDay = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

const categoryMatches = (category: Category, term: string) => {
  const t = term.toLowerCase();
  return (
    category.role === t ||
    category.path.toLowerCase() === t ||
    category.displayName.toLowerCase() === t
  );
};

class CriteriaVisitor extends SearchQueryExpressionVisitor {
  visit(root: QueryExpression) {
    return this.visitAndGetResult(root);
  }
  visitAnd(node: AndQueryExpression) {
    this._result = ['and', this.visitAndGetResult(node.e1), this.visitAndGetResult(node.e2)];
  }
  visitOr(node: OrQueryExpression) {
    this._result = ['or', this.visitAndGetResult(node.e1), this.visitAndGetResult(node.e2)];
  }
  visitNot(node: NotQueryExpression) {
    this._result = [
      'and',
      this.visitAndGetResult(node.e1),
      ['not', this.visitAndGetResult(node.e2)],
    ];
  }
  visitFrom(node) {
    this._result = ['from', textOf(node)];
  }
  visitTo(node) {
    this._result = ['to', textOf(node)];
  }
  visitSubject(node) {
    this._result = ['subject', textOf(node)];
  }
  visitGeneric(node) {
    // The fields Apple Mail, FairEmail and K-9 search for a bare word. TEXT would also
    // match Received headers and Message-IDs, so a host name or a random string hits
    // every message that passed through it.
    const text = textOf(node);
    this._result = [
      'or',
      ['from', text],
      ['to', text],
      ['cc', text],
      ['subject', text],
      ['body', text],
    ];
  }
  visitUnread(node) {
    this._result = [node.status ? 'unread' : 'read'];
  }
  visitStarred(node) {
    this._result = [node.status ? 'flagged' : 'unflagged'];
  }
  visitHasAttachment() {
    // Mail with attachments is multipart/mixed (RFC 2046 5.1.3). The engine stores no
    // attachment flag the server could be asked about.
    this._result = ['header', 'Content-Type', 'multipart/mixed'];
  }
  visitDate(node: DateQueryExpression) {
    const date = dateOf(node);
    if (!date) {
      throw new Unsupported(`unparseable date ${textOf(node)}`);
    }
    this._result = [node.direction === 'before' ? 'before' : 'since', imapDay(date)];
  }
  visitIn() {
    // A folder is a scope, not a SEARCH key; only top-level `in:` terms can become one.
    throw new Unsupported('in: inside OR or NOT');
  }
}

const GMAIL_ROLE_OPERATORS = {
  inbox: 'in:inbox',
  sent: 'in:sent',
  drafts: 'in:drafts',
  trash: 'in:trash',
  spam: 'in:spam',
  starred: 'is:starred',
  important: 'is:important',
  all: '(-in:trash -in:spam)',
};

// Gmail's web search operators, https://support.google.com/mail/answer/7190.
class GmailVisitor extends SearchQueryExpressionVisitor {
  categories: Category[];

  constructor(categories: Category[]) {
    super();
    this.categories = categories;
  }

  visit(root: QueryExpression) {
    return this.visitAndGetResult(root);
  }
  quote(text: string) {
    return /^[\w.@+]+$/.test(text) ? text : `"${text.replace(/"/g, '')}"`;
  }
  visitAnd(node: AndQueryExpression) {
    this._result = `(${this.visitAndGetResult(node.e1)} ${this.visitAndGetResult(node.e2)})`;
  }
  visitOr(node: OrQueryExpression) {
    this._result = `(${this.visitAndGetResult(node.e1)} OR ${this.visitAndGetResult(node.e2)})`;
  }
  visitNot(node: NotQueryExpression) {
    this._result = `(${this.visitAndGetResult(node.e1)} -(${this.visitAndGetResult(node.e2)}))`;
  }
  visitFrom(node) {
    this._result = `from:${this.quote(textOf(node))}`;
  }
  visitTo(node) {
    this._result = `to:${this.quote(textOf(node))}`;
  }
  visitSubject(node) {
    this._result = `subject:${this.quote(textOf(node))}`;
  }
  visitGeneric(node) {
    this._result = this.quote(textOf(node));
  }
  visitUnread(node) {
    this._result = node.status ? 'is:unread' : 'is:read';
  }
  visitStarred(node) {
    this._result = node.status ? 'is:starred' : '-is:starred';
  }
  visitHasAttachment() {
    this._result = 'has:attachment';
  }
  visitDate(node: DateQueryExpression) {
    const date = dateOf(node);
    if (!date) {
      throw new Unsupported(`unparseable date ${textOf(node)}`);
    }
    // Epoch seconds are exact; a bare date is read as midnight Pacific time.
    // https://developers.google.com/workspace/gmail/api/guides/filtering
    const seconds = Math.floor(date.getTime() / 1000);
    this._result = `${node.direction === 'before' ? 'before' : 'after'}:${seconds}`;
  }
  visitIn(node: InQueryExpression) {
    const term = textOf(node);
    const category = this.categories.find((c) => categoryMatches(c, term));
    // Gmail's system mailboxes are operators whether or not the account lists them.
    const operator = GMAIL_ROLE_OPERATORS[category ? category.role : term.toLowerCase()];
    if (operator) {
      this._result = operator;
    } else {
      // Gmail's label: takes the name as shown, "Parent/Child" for a nested one; the IMAP
      // path spells non-ASCII and '&' in modified UTF-7 (RFC 3501 5.1.3), which no label has.
      this._result = `label:${this.quote(category ? imapUtf7.decode(category.path) : term)}`;
    }
  }
}

const conjuncts = (node: QueryExpression): QueryExpression[] =>
  node instanceof AndQueryExpression ? [...conjuncts(node.e1), ...conjuncts(node.e2)] : [node];

// `in:a` or `(in:a OR in:b)`: the folder names a term scopes the search to, or null.
const scopeTerms = (node: QueryExpression): string[] | null => {
  if (node instanceof InQueryExpression) {
    return [textOf(node)];
  }
  if (node instanceof OrQueryExpression) {
    const a = scopeTerms(node.e1);
    const b = scopeTerms(node.e2);
    return a && b ? [...a, ...b] : null;
  }
  return null;
};

// Whether the query asks for mail in a folder with one of these roles. What a NOT excludes
// is not asked for: every search the search bar runs excludes Trash and Spam that way.
const asksForRoles = (node: QueryExpression, categories: Category[], roles: string[]): boolean => {
  if (node instanceof InQueryExpression) {
    return categories.some((c) => roles.includes(c.role) && categoryMatches(c, textOf(node)));
  }
  if (node instanceof NotQueryExpression) {
    return asksForRoles(node.e1, categories, roles);
  }
  const children = [(node as any).e1, (node as any).e2].filter(Boolean);
  return children.some((child) => asksForRoles(child, categories, roles));
};

export default class RemoteSearchQueryBackend {
  /*
   * The request for one account, or null when this query cannot be run on its server, in
   * which case the local search alone answers it.
   */
  static compile(
    ast: QueryExpression,
    account: Account,
    categories: Category[]
  ): RemoteSearchRequest | null {
    try {
      if (account.provider === 'gmail') {
        return RemoteSearchQueryBackend.compileGmail(ast, categories);
      }
      return RemoteSearchQueryBackend.compileIMAP(ast, categories);
    } catch (err) {
      if (err instanceof Unsupported) {
        return null;
      }
      throw err;
    }
  }

  static compileGmail(ast: QueryExpression, categories: Category[]): RemoteSearchRequest {
    const request: RemoteSearchRequest = { gmailRaw: new GmailVisitor(categories).visit(ast) };
    // All Mail, searched by default, holds neither Trash nor Spam.
    if (asksForRoles(ast, categories, ['trash', 'spam'])) {
      request.folderIds = categories
        .filter((c) => ['all', 'trash', 'spam'].includes(c.role))
        .map((c) => c.id);
    }
    return request;
  }

  static compileIMAP(ast: QueryExpression, categories: Category[]): RemoteSearchRequest | null {
    let scope: Category[] | null = null;
    let excluded: Category[] = [];
    const rest: QueryExpression[] = [];

    // Only Gmail has labels, so every category of this account is a folder.
    const matching = (names: string[]) =>
      categories.filter((f) => names.some((n) => categoryMatches(f, n)));
    const pending = conjuncts(ast);
    while (pending.length) {
      const term = pending.shift();
      const excludedNames = term instanceof NotQueryExpression ? scopeTerms(term.e2) : null;
      if (excludedNames) {
        excluded = [...excluded, ...matching(excludedNames)];
        pending.push(...conjuncts((term as NotQueryExpression).e1));
        continue;
      }
      const names = scopeTerms(term);
      if (!names) {
        rest.push(term);
        continue;
      }
      scope = scope ? scope.filter((f) => matching(names).includes(f)) : matching(names);
    }
    if (scope) {
      scope = scope.filter((f) => !excluded.includes(f));
      if (scope.length === 0) {
        return null;
      }
    } else if (excluded.some((f) => f.role !== 'trash' && f.role !== 'spam')) {
      // The engine already leaves Trash and Spam out; any other exclusion would need
      // the account's full folder list sent as the scope.
      return null;
    }

    const visitor = new CriteriaVisitor();
    const parts = rest.map((term) => visitor.visit(term));
    const request: RemoteSearchRequest = {
      criteria: parts.length === 0 ? ['all'] : parts.length === 1 ? parts[0] : ['and', ...parts],
    };
    if (scope) {
      request.folderIds = scope.map((f) => f.id);
    }
    return request;
  }
}
