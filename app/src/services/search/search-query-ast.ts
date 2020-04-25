export class SearchQueryExpressionVisitor {
  _result = null;

  visitAndGetResult(node) {
    node.accept(this);
    const result = this._result;
    this._result = null;
    return result;
  }

  visitAnd(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitNot(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitOr(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitFrom(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitDate(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitTo(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitSubject(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitGeneric(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitText(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitUnread(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitStarred(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitMatch(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitIn(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitHasAttachment(node) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
}

export class QueryExpression {
  _isMatchCompatible = null;

  accept(visitor) {
    throw new Error(`Abstract function not implemented!: ${visitor}`);
  }

  isMatchCompatible() {
    if (this._isMatchCompatible === null) {
      this._isMatchCompatible = this._computeIsMatchCompatible();
    }
    return this._isMatchCompatible;
  }

  _computeIsMatchCompatible() {
    throw new Error('Abstract function not implemented!');
  }

  equals(other): boolean {
    throw new Error(`Abstract function not implemented!: ${other}`);
  }
}

export class NotQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1, e2) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor) {
    visitor.visitNot(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other) {
    if (!(other instanceof NotQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class AndQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1, e2) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor) {
    visitor.visitAnd(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other) {
    if (!(other instanceof AndQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class OrQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1, e2) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor) {
    visitor.visitOr(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other) {
    if (!(other instanceof OrQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class FromQueryExpression extends QueryExpression {
  text: SearchQueryToken;

  constructor(text) {
    super();
    this.text = text;
  }

  accept(visitor) {
    visitor.visitFrom(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof FromQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class DateQueryExpression extends QueryExpression {
  text: SearchQueryToken;
  direction: 'before' | 'after';

  constructor(text, direction: 'before' | 'after' = 'before') {
    super();
    this.text = text;
    this.direction = direction;
  }

  accept(visitor) {
    visitor.visitDate(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other) {
    if (!(other instanceof DateQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class ToQueryExpression extends QueryExpression {
  text: SearchQueryToken;

  constructor(text) {
    super();
    this.text = text;
  }

  accept(visitor) {
    visitor.visitTo(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof ToQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class SubjectQueryExpression extends QueryExpression {
  text: SearchQueryToken;

  constructor(text) {
    super();
    this.text = text;
  }

  accept(visitor) {
    visitor.visitSubject(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof SubjectQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class UnreadStatusQueryExpression extends QueryExpression {
  status: boolean;

  constructor(status) {
    super();
    this.status = status;
  }

  accept(visitor) {
    visitor.visitUnread(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other) {
    if (!(other instanceof UnreadStatusQueryExpression)) {
      return false;
    }
    return this.status === other.status;
  }
}

export class StarredStatusQueryExpression extends QueryExpression {
  status: boolean;

  constructor(status) {
    super();
    this.status = status;
  }

  accept(visitor) {
    visitor.visitStarred(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other) {
    if (!(other instanceof StarredStatusQueryExpression)) {
      return false;
    }
    return this.status === other.status;
  }
}

export class GenericQueryExpression extends QueryExpression {
  text: SearchQueryToken;

  constructor(text) {
    super();
    this.text = text;
  }

  accept(visitor) {
    visitor.visitGeneric(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof GenericQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class TextQueryExpression extends QueryExpression {
  token: SearchQueryToken;

  constructor(text) {
    super();
    this.token = text;
  }

  accept(visitor) {
    visitor.visitText(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof TextQueryExpression)) {
      return false;
    }
    return this.token.equals(other.token);
  }
}

export class InQueryExpression extends QueryExpression {
  text: SearchQueryToken;

  constructor(text) {
    super();
    this.text = text;
  }

  accept(visitor) {
    visitor.visitIn(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other) {
    if (!(other instanceof InQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class HasAttachmentQueryExpression extends QueryExpression {
  accept(visitor) {
    visitor.visitHasAttachment(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other) {
    return other instanceof HasAttachmentQueryExpression;
  }
}

/*
 * Intermediate representation for multiple match-compatible nodes. Used when
 * translating the initial query AST into the proper SQL-compatible query.
 */
export class MatchQueryExpression extends QueryExpression {
  rawQuery: string;

  constructor(rawMatchQuery) {
    super();
    this.rawQuery = rawMatchQuery;
  }

  accept(visitor) {
    visitor.visitMatch(this);
  }

  _computeIsMatchCompatible() {
    /*
     * We should never call this for match nodes b/c we generate match nodes
     * after checking if other nodes are match-compatible.
     */
    throw new Error('Invalid node');
  }

  equals(other) {
    if (!(other instanceof MatchQueryExpression)) {
      return false;
    }
    return this.rawQuery === other.rawQuery;
  }
}

export class SearchQueryToken {
  s: string;

  constructor(s) {
    this.s = s;
  }

  equals(other) {
    if (!(other instanceof SearchQueryToken)) {
      return false;
    }
    return this.s === other.s;
  }
}
