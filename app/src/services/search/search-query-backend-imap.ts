import _ from 'underscore';
import {
  AndQueryExpression,
  OrQueryExpression,
  InQueryExpression,
  FromQueryExpression,
  ToQueryExpression,
  SubjectQueryExpression,
  GenericQueryExpression,
  TextQueryExpression,
  UnreadStatusQueryExpression,
  StarredStatusQueryExpression,
  QueryExpression,
  SearchQueryExpressionVisitor,
} from './search-query-ast';
import { Folder } from '../../flux/models/folder';

const TOP = 'top';

class IMAPSearchQueryFolderFinderVisitor extends SearchQueryExpressionVisitor {
  visit(root: QueryExpression) {
    const result = this.visitAndGetResult(root);
    if (result === TOP) {
      return 'all';
    }
    return result;
  }

  visitAnd(node: AndQueryExpression) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    if (lhs === TOP) {
      this._result = rhs;
      return;
    }
    if (rhs === TOP) {
      this._result = lhs;
      return;
    }
    this._result = _.intersection(lhs, rhs);
  }

  visitOr(node: OrQueryExpression) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    if (lhs === TOP || rhs === TOP) {
      this._result = TOP;
      return;
    }
    this._result = _.union(lhs, rhs);
  }

  visitIn(node: InQueryExpression) {
    const folderName = this.visitAndGetResult(node.text);
    this._result = [folderName];
  }

  visitFrom(/* node */) {
    this._result = TOP;
  }

  visitTo(/* node */) {
    this._result = TOP;
  }

  visitSubject(/* node */) {
    this._result = TOP;
  }

  visitGeneric(/* node */) {
    this._result = TOP;
  }

  visitText(node) {
    this._result = node.token.s;
  }

  visitUnread(/* node */) {
    this._result = TOP;
  }

  visitStarred(/* node */) {
    this._result = TOP;
  }

  visitHasAttachment(/* node */) {
    this._result = TOP;
  }
}

class IMAPSearchQueryExpressionVisitor extends SearchQueryExpressionVisitor {
  _folder: Folder;

  constructor(folder: Folder) {
    super();
    this._folder = folder;
  }

  visit(root: QueryExpression) {
    const result = this.visitAndGetResult(root);
    if (root instanceof AndQueryExpression) {
      return result;
    }
    return [result];
  }

  visitAnd(node: AndQueryExpression) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = [];
    if (node.e1 instanceof AndQueryExpression) {
      this._result = this._result.concat(lhs);
    } else {
      this._result.push(lhs);
    }

    if (node.e2 instanceof AndQueryExpression) {
      this._result = this._result.concat(rhs);
    } else {
      this._result.push(rhs);
    }
  }

  visitOr(node: OrQueryExpression) {
    const lhs = this.visitAndGetResult(node.e1);
    const rhs = this.visitAndGetResult(node.e2);
    this._result = ['OR', lhs, rhs];
  }

  visitFrom(node: FromQueryExpression) {
    const text = this.visitAndGetResult(node.text);
    this._result = ['FROM', text];
  }

  visitDate(node: QueryExpression) {
    throw new Error(`Function not implemented!: ${node}`);
  }

  visitTo(node: ToQueryExpression) {
    const text = this.visitAndGetResult(node.text);
    this._result = ['TO', text];
  }

  visitSubject(node: SubjectQueryExpression) {
    const text = this.visitAndGetResult(node.text);
    this._result = ['SUBJECT', text];
  }

  visitGeneric(node: GenericQueryExpression) {
    const text = this.visitAndGetResult(node.text);
    this._result = ['TEXT', text];
  }

  visitText(node: TextQueryExpression) {
    this._result = node.token.s;
  }

  visitUnread(node: UnreadStatusQueryExpression) {
    this._result = node.status ? 'UNSEEN' : 'SEEN';
  }

  visitStarred(node: StarredStatusQueryExpression) {
    this._result = node.status ? 'FLAGGED' : 'UNFLAGGED';
  }

  visitIn(node: InQueryExpression) {
    const text = this.visitAndGetResult(node.text);
    this._result = text === this._folder.name ? 'ALL' : '!ALL';
  }

  visitHasAttachment(/* node */) {
    this._result = [
      'OR',
      ['HEADER', 'Content-Type', 'multipart/mixed'],
      ['HEADER', 'Content-Type', 'multipart/related'],
    ];
  }
}

export default class IMAPSearchQueryBackend {
  static ALL_FOLDERS() {
    return 'all';
  }

  static compile(ast: QueryExpression, folder: Folder) {
    return new IMAPSearchQueryBackend().compile(ast, folder);
  }

  static folderNamesForQuery(ast: QueryExpression) {
    return new IMAPSearchQueryFolderFinderVisitor().visit(ast);
  }

  compile(ast: QueryExpression, folder: Folder) {
    return new IMAPSearchQueryExpressionVisitor(folder).visit(ast);
  }
}
