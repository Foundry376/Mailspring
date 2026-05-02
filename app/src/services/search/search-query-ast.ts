export class SearchQueryExpressionVisitor {
  _result = null;

  visitAndGetResult(node: QueryExpression) {
    node.accept(this);
    const result = this._result;
    this._result = null;
    return result;
  }

  visitAnd(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitNot(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitOr(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitFrom(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitDate(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitTo(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitSubject(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitGeneric(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitText(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitUnread(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitStarred(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitMatch(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitIn(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
  visitHasAttachment(node: QueryExpression) {
    throw new Error(`Abstract function not implemented!: ${node}`);
  }
}

export class QueryExpression {
  _isMatchCompatible = null;

  accept(visitor: SearchQueryExpressionVisitor) {
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

  equals(other: QueryExpression): boolean {
    throw new Error(`Abstract function not implemented!: ${other}`);
  }
}

export class NotQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1: QueryExpression, e2: QueryExpression) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitNot(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other: QueryExpression) {
    if (!(other instanceof NotQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class AndQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1: QueryExpression, e2: QueryExpression) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitAnd(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other: QueryExpression) {
    if (!(other instanceof AndQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class OrQueryExpression extends QueryExpression {
  e1: QueryExpression;
  e2: QueryExpression;

  constructor(e1: QueryExpression, e2: QueryExpression) {
    super();
    this.e1 = e1;
    this.e2 = e2;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitOr(this);
  }

  _computeIsMatchCompatible() {
    if (!this.e1 || !this.e2) {
      return false;
    }
    return this.e1.isMatchCompatible() && this.e2.isMatchCompatible();
  }

  equals(other: QueryExpression) {
    if (!(other instanceof OrQueryExpression)) {
      return false;
    }
    return this.e1.equals(other.e1) && this.e2.equals(other.e2);
  }
}

export class FromQueryExpression extends QueryExpression {
  text: TextQueryExpression;

  constructor(text: TextQueryExpression) {
    super();
    this.text = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitFrom(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof FromQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class DateQueryExpression extends QueryExpression {
  text: TextQueryExpression;
  direction: 'before' | 'after';

  constructor(text: TextQueryExpression, direction: 'before' | 'after' = 'before') {
    super();
    this.text = text;
    this.direction = direction;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitDate(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof DateQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class ToQueryExpression extends QueryExpression {
  text: TextQueryExpression;

  constructor(text: TextQueryExpression) {
    super();
    this.text = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitTo(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof ToQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class SubjectQueryExpression extends QueryExpression {
  text: TextQueryExpression;

  constructor(text: TextQueryExpression) {
    super();
    this.text = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitSubject(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof SubjectQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class UnreadStatusQueryExpression extends QueryExpression {
  status: boolean;

  constructor(status: boolean) {
    super();
    this.status = status;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitUnread(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof UnreadStatusQueryExpression)) {
      return false;
    }
    return this.status === other.status;
  }
}

export class StarredStatusQueryExpression extends QueryExpression {
  status: boolean;

  constructor(status: boolean) {
    super();
    this.status = status;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitStarred(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof StarredStatusQueryExpression)) {
      return false;
    }
    return this.status === other.status;
  }
}

export class GenericQueryExpression extends QueryExpression {
  text: TextQueryExpression;

  constructor(text: TextQueryExpression) {
    super();
    this.text = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitGeneric(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof GenericQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class TextQueryExpression extends QueryExpression {
  token: SearchQueryToken;

  constructor(text: SearchQueryToken) {
    super();
    this.token = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitText(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof TextQueryExpression)) {
      return false;
    }
    return this.token.equals(other.token);
  }
}

export class InQueryExpression extends QueryExpression {
  text: TextQueryExpression;

  constructor(text: TextQueryExpression) {
    super();
    this.text = text;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitIn(this);
  }

  _computeIsMatchCompatible() {
    return true;
  }

  equals(other: QueryExpression) {
    if (!(other instanceof InQueryExpression)) {
      return false;
    }
    return this.text.equals(other.text);
  }
}

export class HasAttachmentQueryExpression extends QueryExpression {
  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitHasAttachment(this);
  }

  _computeIsMatchCompatible() {
    return false;
  }

  equals(other: QueryExpression) {
    return other instanceof HasAttachmentQueryExpression;
  }
}

/*
 * Intermediate representation for multiple match-compatible nodes. Used when
 * translating the initial query AST into the proper SQL-compatible query.
 */
export class MatchQueryExpression extends QueryExpression {
  rawQuery: string;

  constructor(rawMatchQuery: string) {
    super();
    this.rawQuery = rawMatchQuery;
  }

  accept(visitor: SearchQueryExpressionVisitor) {
    visitor.visitMatch(this);
  }

  _computeIsMatchCompatible() {
    /*
     * We should never call this for match nodes b/c we generate match nodes
     * after checking if other nodes are match-compatible.
     */
    throw new Error('Invalid node');
  }

  equals(other: QueryExpression) {
    if (!(other instanceof MatchQueryExpression)) {
      return false;
    }
    return this.rawQuery === other.rawQuery;
  }
}

export class SearchQueryToken {
  s: string;

  constructor(s: string) {
    this.s = s;
  }

  equals(other: SearchQueryToken) {
    if (!(other instanceof SearchQueryToken)) {
      return false;
    }
    return this.s === other.s;
  }
}
