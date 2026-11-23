import {
  SearchQueryExpressionVisitor,
  OrQueryExpression,
  NotQueryExpression,
  AndQueryExpression,
  DateQueryExpression,
  UnreadStatusQueryExpression,
  StarredStatusQueryExpression,
  HasAttachmentQueryExpression,
  InQueryExpression,
  MatchQueryExpression,
  QueryExpression,
  FromQueryExpression,
  ToQueryExpression,
} from './search-query-ast';
import { DateUtils } from 'mailspring-exports';
import { imapUtf7 } from '../../utils/imap-utf7';
import {
  ADDRESS_FIELDS,
  messageHasAddressSQL,
  sqlString,
  wholeAddress as parseWholeAddress,
} from '../message-address-sql';

// Category.displayName drops one of these and the delimiter after it.
const DISPLAY_NAME_PREFIXES = ['INBOX', '[Gmail]', '[Mailspring]', 'Mailspring'];

type Chain = typeof AndQueryExpression | typeof OrQueryExpression;

// The parser builds right-nested binary trees, and FTS5's parser overflows its stack on
// deeply nested parentheses (about 40 levels), so chains of the same operator are emitted
// flat: `(a OR b OR c)` rather than `(a OR (b OR c))`.
function operands(node: QueryExpression, type: Chain) {
  const out: QueryExpression[] = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (n instanceof type) {
      stack.push(n.e2, n.e1);
    } else {
      out.push(n);
    }
  }
  return out;
}

const chainOf = (type: Chain, nodes: QueryExpression[]) =>
  nodes.reduceRight((rest, n) => new type(n, rest));

// The Message fields a whole-address `from:`/`to:` term is checked against. ThreadSearch.to_
// holds To, Cc and Bcc (MailProcessor::appendToThreadSearchContent).
const addressFields = (node: FromQueryExpression | ToQueryExpression) =>
  node instanceof FromQueryExpression
    ? { column: 'from_', keys: ADDRESS_FIELDS.from }
    : { column: 'to_', keys: ADDRESS_FIELDS.to };

// A `from:`/`to:` value that is a whole address, or null for a partial value such as a name,
// `bob` or `example.com`, which keeps prefix matching.
const wholeAddress = (node: FromQueryExpression | ToQueryExpression) =>
  parseWholeAddress(node.text.token.s);

function hasWholeAddressTerm(root: QueryExpression) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n instanceof FromQueryExpression || n instanceof ToQueryExpression) {
      if (wholeAddress(n)) return true;
    } else if (
      n instanceof AndQueryExpression ||
      n instanceof OrQueryExpression ||
      n instanceof NotQueryExpression
    ) {
      stack.push(n.e1, n.e2);
    }
  }
  return false;
}

/*
 * This class visits a match-compatible subtree and condenses it into a single
 * MatchQueryExpression.
 */
class MatchQueryExpressionVisitor extends SearchQueryExpressionVisitor {
  visit(root) {
    const result = this.visitAndGetResult(root);
    return new MatchQueryExpression(`${result}`);
  }

  _assertIsMatchCompatible(node) {
    if (!node.isMatchCompatible()) {
      throw new Error(`Expected ${node} to be match compatible`);
    }
  }

  visitAnd(node) {
    this._assertIsMatchCompatible(node);
    const parts = operands(node, AndQueryExpression).map((n) => this.visitAndGetResult(n));
    this._result = `(${parts.join(' AND ')})`;
  }

  visitNot(node) {
    this._assertIsMatchCompatible(node);
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = `(${lhs} NOT ${rhs})`;
  }

  visitOr(node) {
    const parts = operands(node, OrQueryExpression).map((n) => this.visitAndGetResult(n));
    this._result = `(${parts.join(' OR ')})`;
  }

  visitDate(node) {}

  visitFrom(node) {
    const text = this.visitAndGetResult(node.text);
    this._result = `(from_ : "${text}"*)`;
  }

  visitTo(node) {
    const text = this.visitAndGetResult(node.text);
    this._result = `(to_ : "${text}"*)`;
  }

  visitSubject(node) {
    const text = this.visitAndGetResult(node.text);
    this._result = `(subject : "${text}"*)`;
  }

  visitGeneric(node) {
    const text = this.visitAndGetResult(node.text);
    this._result = `("${text}"*)`;
  }

  visitText(node) {
    // Escape double quotes for FTS5 quoted string context. The callers
    // (visitFrom, visitTo, visitSubject, visitGeneric, visitIn) all wrap
    // this text in double quotes, so the only character that needs escaping
    // is the double quote itself (doubled per FTS5 spec). All other special
    // FTS5 characters are neutralized by being inside the quoted phrase.
    this._result = node.token.s.replace(/"/g, '""');
  }

  visitUnread(node) {
    this._assertIsMatchCompatible(node);
  }

  visitStarred(node) {
    this._assertIsMatchCompatible(node);
  }

  visitIn(node) {
    this._assertIsMatchCompatible(node);
  }

  visitHasAttachment(node) {
    this._assertIsMatchCompatible(node);
  }
}

/*
 * This class creates a new AST by converting match-compatible subtrees into
 * MatchQueryExpressions.
 */
class MatchCompatibleQueryCondenser extends SearchQueryExpressionVisitor {
  private _matchVisitor = new MatchQueryExpressionVisitor();
  private _wholeAddresses: boolean;

  // With `wholeAddresses`, `from:`/`to:` terms whose value is a whole address are left for
  // StructuredSearchQueryVisitor to compile on their own, as no MATCH expression can say it.
  constructor({ wholeAddresses }: { wholeAddresses: boolean }) {
    super();
    this._wholeAddresses = wholeAddresses;
  }

  visit(root: QueryExpression) {
    return this.visitAndGetResult(root);
  }

  _condensable(node: QueryExpression) {
    return node.isMatchCompatible() && !(this._wholeAddresses && hasWholeAddressTerm(node));
  }

  visitAnd(node) {
    this._result = this._condenseChain(node, AndQueryExpression);
  }

  visitOr(node) {
    this._result = this._condenseChain(node, OrQueryExpression);
  }

  // The operands of a chain that MATCH can express become one MATCH, wherever they sit in it.
  _condenseChain(node: QueryExpression, type: Chain) {
    if (this._condensable(node)) {
      return this._matchVisitor.visit(node);
    }
    const parts = operands(node, type);
    const matchable = parts.filter((n) => this._condensable(n));
    const rest = parts.filter((n) => !this._condensable(n)).map((n) => this.visitAndGetResult(n));
    if (matchable.length) {
      rest.unshift(this._matchVisitor.visit(chainOf(type, matchable)));
    }
    return chainOf(type, rest);
  }

  visitNot(node) {
    if (this._condensable(node)) {
      this._result = this._matchVisitor.visit(node);
      return;
    }
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = new NotQueryExpression(lhs, rhs);
  }

  visitFrom(node) {
    this._result = this._condensable(node) ? this._matchVisitor.visit(node) : node;
  }

  visitTo(node) {
    this._result = this._condensable(node) ? this._matchVisitor.visit(node) : node;
  }

  visitSubject(node) {
    this._result = this._matchVisitor.visit(node);
  }

  visitGeneric(node) {
    this._result = this._matchVisitor.visit(node);
  }

  visitText(node) {
    this._result = this._matchVisitor.visit(node);
  }

  visitIn(node) {
    this._result = new InQueryExpression(node.text);
  }

  visitUnread(node) {
    this._result = new UnreadStatusQueryExpression(node.status);
  }

  visitDate(node) {
    this._result = new DateQueryExpression(node.text, node.direction);
  }

  visitStarred(node) {
    this._result = new StarredStatusQueryExpression(node.status);
  }

  visitHasAttachment(/* node */) {
    this._result = new HasAttachmentQueryExpression();
  }
}

/*
 * Converts a search query into the appropriate where clause. It does this by
 * converting match-compatible subtrees into the appropriate subquery that
 * uses a MATCH clause.
 */
class StructuredSearchQueryVisitor extends SearchQueryExpressionVisitor {
  private _className: string;

  constructor(className) {
    super();
    this._className = className;
  }

  // A term that constrains nothing (a date chrono can't read) compiles to '' and is left out
  // of the expression around it; a query of only such terms matches everything.
  visit(root) {
    return this.visitAndGetResult(root) || '(1)';
  }

  visitNot(node) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    if (!rhs) {
      this._result = lhs;
    } else if (!lhs) {
      this._result = `(NOT ${rhs})`;
    } else {
      this._result = `(${lhs} AND NOT ${rhs})`;
    }
  }

  visitAnd(node) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = lhs && rhs ? `(${lhs} AND ${rhs})` : lhs || rhs;
  }

  visitOr(node) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = lhs && rhs ? `(${lhs} OR ${rhs})` : lhs || rhs;
  }

  visitFrom(node) {
    this._result = this._wholeAddressSQL(node);
  }

  visitTo(node) {
    this._result = this._wholeAddressSQL(node);
  }

  // `from:bob@example.com` matches threads with a message whose field holds exactly that
  // address, case-insensitively. The FTS phrase alone would also match alice.bob@example.com
  // and bob@example.community, since the tokenizer splits addresses at `.` and `@`; it narrows
  // the per-message check to threads the index found. It is a prefix phrase because the sync
  // engine doesn't index an address when one it already indexed for the thread begins with it
  // (stringByAppendingOrSkipping in MailProcessor.cpp).
  _wholeAddressSQL(node: FromQueryExpression | ToQueryExpression) {
    const address = wholeAddress(node);
    const { column, keys } = addressFields(node);
    const searchTable = `${this._className}Search`;
    const hasAddress = messageHasAddressSQL(keys, (email) => `${email} = ${sqlString(address)}`);
    const onMessage = `EXISTS (SELECT 1 FROM \`Message\` WHERE \`Message\`.\`threadId\` = \`${searchTable}\`.\`content_id\` AND ${hasAddress})`;
    const match = sqlString(`${column} : "${address}"*`);
    return `(\`${this._className}\`.\`id\` IN (SELECT \`content_id\` FROM \`${searchTable}\` WHERE \`${searchTable}\` MATCH ${match} AND ${onMessage}))`;
  }

  visitSubject(node) {
    throw new Error(`Unreachable: ${node}`);
  }

  visitGeneric(node) {
    throw new Error(`Unreachable: ${node}`);
  }

  visitText(node) {
    throw new Error(`Unreachable: ${node}`);
  }

  // `in:` names a folder or label by role, by full path as the search bar writes it
  // (thread-search-bar.tsx), or by the name the sidebar and `in:` suggestions show
  // (Category.displayName), case-insensitively.
  visitIn(node) {
    const name: string = node.text.token.s;
    const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

    const pathMatches = [...new Set([name, imapUtf7.encode(name)])].flatMap((path) => [
      `\`path\` = ${sqlString(path)} COLLATE NOCASE`,
      ...DISPLAY_NAME_PREFIXES.map(
        (prefix) =>
          `\`path\` LIKE ${sqlString(`${likeEscape(prefix)}_${likeEscape(path)}`)} ESCAPE '\\'`
      ),
    ]);
    const where = [`\`role\` = ${sqlString(name)} COLLATE NOCASE`, ...pathMatches].join(' OR ');
    const named = (table: string) => `SELECT \`id\` FROM \`${table}\` WHERE ${where}`;
    const categoryIds = `${named('Folder')} UNION ${named('Label')}`;
    this._result = `(\`${this._className}\`.\`id\` IN (SELECT \`id\` FROM \`${this._className}Category\` WHERE \`value\` IN (${categoryIds})))`;
  }

  visitUnread(node) {
    this._result = `(\`${this._className}\`.\`unread\` ${node.status ? '>' : '='} 0)`;
  }

  visitStarred(node) {
    this._result = `(\`${this._className}\`.\`starred\` ${node.status ? '>' : '='} 0)`;
  }

  visitHasAttachment(/* node */) {
    // Note: The sync engine populates attachmentCount in the data blob, but the
    // column is not queryable in the schema. This LIKE clause is a workaround.
    this._result = `(\`${this._className}\`.\`data\` NOT LIKE '%"attachmentCount":0%')`;
  }

  visitDate(node) {
    const comparator = node.direction === 'before' ? '<' : '>';
    const date = DateUtils.getChronoPast().parseDate(node.text.token.s);
    // A date chrono can't read (`before:foo`, a half-typed date) constrains nothing.
    if (!date) {
      this._result = '';
      return;
    }
    const ts = Math.floor(date.getTime() / 1000);
    this._result = `(\`${this._className}\`.\`lastMessageReceivedTimestamp\` ${comparator} ${ts})`;
  }

  visitMatch(node) {
    const searchTable = `${this._className}Search`;

    // in sqlite3, you use '' to escape a '. Weird right?
    const escaped = node.rawQuery.replace(/'/g, "''");

    this._result = `(\`${this._className}\`.\`id\` IN (SELECT \`content_id\` FROM \`${searchTable}\` WHERE \`${searchTable}\` MATCH '${escaped}'))`;
  }
}

export default class LocalSearchQueryBackend {
  private _modelClassName: string;

  constructor(modelClassName) {
    this._modelClassName = modelClassName;
  }

  compile(ast: QueryExpression) {
    // The whole-address check reads Message rows by threadId, which only Thread search has.
    const condenser = new MatchCompatibleQueryCondenser({
      wholeAddresses: this._modelClassName === 'Thread',
    });
    const intermediateAST = condenser.visit(ast);

    const codegen = new StructuredSearchQueryVisitor(`${this._modelClassName}`);
    return codegen.visit(intermediateAST);
  }
}
