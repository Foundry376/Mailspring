import LocalSearchQueryBackend from '../../services/search/search-query-backend-local';

// https://www.sqlite.org/faq.html#q14
// That's right. Two single quotes in a row…
const singleQuoteEscapeSequence = '\'\'';

// https://www.sqlite.org/fts5.html#section_3
const doubleQuoteEscapeSequence = '""';

/*
Public: The Matcher class encapsulates a particular comparison clause on an {Attribute}.
Matchers can evaluate whether or not an object matches them, and also compose
SQL clauses for the DatabaseStore. Each matcher has a reference to a model
attribute, a comparator and a value.

```javascript

// Retrieving Matchers

isUnread = Thread.attributes.unread.equal(true)

hasLabel = Thread.attributes.categories.contains('label-id-123')

// Using Matchers in Database Queries

DatabaseStore.findAll(Thread).where(isUnread)...

// Using Matchers to test Models

threadA = new Thread(unread: true)
threadB = new Thread(unread: false)

isUnread.evaluate(threadA)
// => true
isUnread.evaluate(threadB)
// => false

```

Section: Database
*/
class Matcher {
  constructor(attr, comparator, val, muid = null, useJoinTableRef = false) {
    this.attr = attr;
    this.comparator = comparator;
    this.val = val;
    if (muid) {
      this.muid = muid;
    } else {
      this.muid = Matcher.muid;
      Matcher.muid = (Matcher.muid + 1) % 50;
    }
    this._useJoinTableRef = useJoinTableRef;
  }

  getMuid() {
    return this.muid;
  }

  setMuid(value) {
    this.muid = value;
  }

  attribute() {
    return this.attr;
  }

  value() {
    return this.val;
  }

  evaluate(model) {
    let modelValue = model[this.attr.modelKey];
    if (modelValue instanceof Function) {
      modelValue = modelValue();
    }
    const matcherValue = this.val;

    // Given an array of strings or models, and a string or model search value,
    // will find if a match exists.
    const modelArrayContainsValue = (array, searchItem) => {
      const asId = v => (v && v.id ? v.id : v);
      const search = asId(searchItem);
      for (const item of array) {
        if (asId(item) === search) {
          return true;
        }
      }
      return false;
    };
    const valueIn = (array, searchItem) => {
      if (array.length === 0) {
        return false;
      }
      for (let item of array) {
        // triple-equals would break this, because we have state = 1 while we look for state='1'
        if (item == searchItem) { // eslint-disable-line
          return true;
        }
      }
      return false;
    };
    const valueNotIn = (array, searchItem) => {
      if (array.length === 0) {
        return true;
      }
      for (let item of array) {
        // triple-equals would break this, because we have state = 1 while we look for state='1'
        if (item == searchItem) { // eslint-disable-line
          return false;
        }
      }
      return true;
    };

    switch (this.comparator) {
      case '=':
        // triple-equals would break this, because we convert false to 0, true to 1
        return modelValue == matcherValue; // eslint-disable-line
      case '!=':
        return modelValue != matcherValue; // eslint-disable-line
      case '<':
        return modelValue < matcherValue;
      case '>':
        return modelValue > matcherValue;
      case '<=':
        return modelValue <= matcherValue;
      case '>=':
        return modelValue >= matcherValue;
      case 'in':
        return valueIn(matcherValue, modelValue);
      case 'not in':
        return valueNotIn(matcherValue, modelValue);
      case 'contains':
        return modelArrayContainsValue(modelValue, matcherValue);
      case 'containsAny':
        return !!matcherValue.find(submatcherValue =>
          modelArrayContainsValue(modelValue, submatcherValue),
        );
      case 'startsWith':
        return modelValue.startsWith(matcherValue);
      case 'like':
        return modelValue.search(new RegExp(`.*${matcherValue}.*`, 'gi')) >= 0;
      default:
        throw new Error(
          `Matcher.evaulate() not sure how to evaluate ${this.attr.modelKey} with comparator ${
          this.comparator
          }`,
        );
    }
  }

  joinTableRef() {
    return `M${this.muid}`;
  }

  joinSQL(klass) {
    switch (this.comparator) {
      case 'contains':
      case 'containsAny': {
        const joinTable = this.attr.tableNameForJoinAgainst(klass);
        const joinTableRef = this.joinTableRef();
        let andSql = '';
        if (this.attr.joinOnWhere) {
          const wheres = [];
          let tmpVal = '';
          let tmpKey = '';
          for (const key of Object.keys(this.attr.joinOnWhere)) {
            tmpVal = this._escapeValue(this.attr.joinOnWhere[key]);
            tmpKey = key;
            if (typeof tmpVal === 'string' && tmpVal.indexOf('(') === 0) {
              wheres.push(` \`${joinTableRef}\`.\`${tmpKey}\` IN ${tmpVal} `);
            } else if (tmpVal === null) {
              wheres.push(` \`${joinTableRef}\`.\`${tmpKey}\` is NULL `);
            } else {
              wheres.push(` \`${joinTableRef}\`.\`${tmpKey}\` = ${tmpVal} `);
            }
          }
          if (wheres.length > 0) {
            andSql = ` AND ( ${wheres.join(' AND ')} ) `;
          }
        }
        return `INNER JOIN \`${joinTable}\` AS \`${joinTableRef}\` ON \`${joinTableRef}\`.\`${this.attr.joinOnField}\` = \`${klass.name}\`.\`id\`${andSql}`;
      }
      default:
        return false;
    }
  }

  _escapeValue(val) {
    if (typeof val === 'string') {
      return `'${val.replace(/'/g, singleQuoteEscapeSequence)}'`;
    } else if (val === true) {
      return 1;
    } else if (val === false) {
      return 0;
    } else if (val instanceof Date) {
      return val.getTime() / 1000;
    } else if (val instanceof Array) {
      const escapedVals = [];
      for (const v of val) {
        if (typeof v !== 'string') {
          throw new Error(`${this.attr.tableColumn} value ${v} must be a string.`);
        }
        escapedVals.push(`'${v.replace(/'/g, singleQuoteEscapeSequence)}'`);
      }
      return `(${escapedVals.join(',')})`;
    } else {
      return val;
    }
  }

  _safeSQL(keyWord) {
    return keyWord
      .replace(/\//g, "//")
      .replace(/\'/g, singleQuoteEscapeSequence)
      .replace(/\[/g, "/[")
      .replace(/\]/g, "/]")
      .replace(/\%/g, "/%")
      .replace(/\&/g, "/&")
      .replace(/\_/g, "/_")
      .replace(/\(/g, "/(")
      .replace(/\)/g, "/)");
  }

  whereSQL(klass) {
    const val = this.comparator === 'like' ? `%${this._safeSQL(this.val)}%` : this.val;
    let escaped = null;
    if (typeof val === 'string') {
      if (this.comparator === 'like') {
        escaped = `'${val}' escape '/' `;
      } else {
        escaped = `'${val.replace(/'/g, singleQuoteEscapeSequence)}'`;
      }
    } else if (val === true) {
      escaped = 1;
    } else if (val === false) {
      escaped = 0;
    } else if (val instanceof Date) {
      escaped = val.getTime() / 1000;
    } else if (val instanceof Array) {
      const escapedVals = [];
      for (const v of val) {
        if (typeof v !== 'string') {
          throw new Error(`${this.attr.tableColumn} value ${v} must be a string.`);
        }
        escapedVals.push(`'${v.replace(/'/g, singleQuoteEscapeSequence)}'`);
      }
      escaped = `(${escapedVals.join(',')})`;
    } else {
      escaped = val;
    }
    let andSql = '';
    if (this.attr.joinOnWhere) {
      const wheres = [];
      let tmpVal = '';
      let tmpKey = '';
      for (const key of Object.keys(this.attr.joinOnWhere)) {
        tmpVal = this._escapeValue(this.attr.joinOnWhere[key]);
        tmpKey = key;
        if (typeof tmpVal === 'string' && tmpVal.indexOf('(') === 0) {
          wheres.push(` \`${this.joinTableRef()}\`.\`${tmpKey}\` IN ${tmpVal} `);
        } else if (tmpVal === null) {
          wheres.push(` \`${this.joinTableRef()}\`.\`${tmpKey}\` is NULL `);
        } else {
          wheres.push(` \`${this.joinTableRef()}\`.\`${tmpKey}\` = ${tmpVal} `);
        }
      }
      andSql = ` AND ( ${wheres.join(' AND ')} ) `;
    }
    if (this.attr.isJoinTable) {
      switch (this.comparator) {
        case '=': {
          if (escaped === null) {
            return `\`${this.joinTableRef()}\`.\`${this.attr.tableColumn}\` IS NULL`;
          }
          return `\`${this.joinTableRef()}\`.\`${this.attr.tableColumn}\` = ${escaped}`;
        }
        case '!=': {
          if (escaped === null) {
            return `\`${this.joinTableRef()}\`.\`${this.attr.tableColumn}\` IS NOT NULL`;
          }
          return `\`${this.joinTableRef()}\`.\`${this.attr.tableColumn}\` != ${escaped}`;
        }
        case 'startsWith':
          return ' RAISE `TODO`; ';
        case 'contains':
          return `\`${this.joinTableRef()}\`.\`value\` = ${escaped}`;
        case 'containsAny':
          return `\`${this.joinTableRef()}\`.\`value\` IN ${escaped} ${andSql}`;
        default:
          return `\`${this.joinTableRef()}\`.\`${this.attr.tableColumn}\` ${this.comparator} ${escaped}`;
      }
    }
    switch (this.comparator) {
      case '=': {
        if (escaped === null) {
          return `\`${klass.name}\`.\`${this.attr.tableColumn}\` IS NULL`;
        }
        return `\`${klass.name}\`.\`${this.attr.tableColumn}\` = ${escaped}`;
      }
      case '!=': {
        if (escaped === null) {
          return `\`${klass.name}\`.\`${this.attr.tableColumn}\` IS NOT NULL`;
        }
        return `\`${klass.name}\`.\`${this.attr.tableColumn}\` != ${escaped}`;
      }
      case 'startsWith':
        return ' RAISE `TODO`; ';
      case 'contains':
        return `\`${this.joinTableRef()}\`.\`value\` = ${escaped}`;
      case 'containsAny':
        return `\`${this.joinTableRef()}\`.\`value\` IN ${escaped} ${andSql}`;
      default:
        return `\`${klass.name}\`.\`${this.attr.tableColumn}\` ${this.comparator} ${escaped}`;
    }
  }
}

Matcher.muid = 0;

class OrCompositeMatcher extends Matcher {
  constructor(children) {
    super();
    this.children = children;
  }

  attribute() {
    return null;
  }

  value() {
    return null;
  }

  evaluate(model) {
    return this.children.some(matcher => matcher.evaluate(model));
  }

  joinSQL(klass) {
    const joins = [];
    for (const matcher of this.children) {
      const join = matcher.joinSQL(klass);
      if (join) {
        joins.push(join);
      }
    }
    return joins.length ? joins.join(' ') : false;
  }

  whereSQL(klass) {
    const wheres = this.children.map(matcher => matcher.whereSQL(klass));
    return `(${wheres.join(' OR ')})`;
  }
}

class JoinOrCompositeMatcher extends OrCompositeMatcher {
  joinSQL(klass) {
    const joins = [];
    for (const matcher of this.children) {
      matcher.setMuid(this.getMuid());
      const join = matcher.joinSQL(klass);
      if (join) {
        joins.push(join);
      }
    }
    return joins.length ? joins.join(' ') : false;
  }

  whereSQL(klass) {
    const muid = this.getMuid();
    const wheres = this.children.map(matcher => {
      matcher.setMuid(muid);
      return matcher.whereSQL(klass);
    });
    return `(${wheres.join(' OR ')})`;
  }
}

class AndCompositeMatcher extends Matcher {
  constructor(children) {
    super();
    this.children = children;
  }

  attribute() {
    return null;
  }

  value() {
    return null;
  }

  evaluate(model) {
    return this.children.every(m => m.evaluate(model));
  }

  joinSQL(klass) {
    const joins = [];
    for (const matcher of this.children) {
      const join = matcher.joinSQL(klass);
      if (join) {
        joins.push(join);
      }
    }
    return joins;
  }

  whereSQL(klass) {
    const wheres = this.children.map(m => m.whereSQL(klass));
    return `(${wheres.join(' AND ')})`;
  }
}

class JoinAndCompositeMatcher extends AndCompositeMatcher {
  joinSQL(klass) {
    const joins = [];
    for (const matcher of this.children) {
      matcher.setMuid(this.getMuid());
      const join = matcher.joinSQL(klass);
      if (join) {
        joins.push(join);
      }
    }
    return joins;
  }

  whereSQL(klass) {
    const muid = this.getMuid();
    const wheres = this.children.map(m => {
      m.setMuid(muid);
      return m.whereSQL(klass);
    });
    return `(${wheres.join(' AND ')})`;
  }
}

class NotCompositeMatcher extends AndCompositeMatcher {
  whereSQL(klass) {
    return `NOT (${super.whereSQL(klass)})`;
  }
}

class StructuredSearchMatcher extends Matcher {
  constructor(searchQuery) {
    super(null, null, null);
    this._searchQuery = searchQuery;
  }

  attribute() {
    return null;
  }

  value() {
    return null;
  }

  // The only way to truly check if a model matches this matcher is to run the query
  // again and check if the model is in the results. This is too expensive, so we
  // will always return true so models aren't excluded from the
  // SearchQuerySubscription result set
  evaluate() {
    return true;
  }

  whereSQL(klass) {
    return new LocalSearchQueryBackend(klass.name).compile(this._searchQuery);
  }
}

class SearchMatcher extends Matcher {
  constructor(searchQuery) {
    if (typeof searchQuery !== 'string' || searchQuery.length === 0) {
      throw new Error('You must pass a string with non-zero length to search.');
    }
    super(null, null, null);
    this.searchQuery = searchQuery
      .trim()
      .replace(/^['"]/, '')
      .replace(/['"]$/, '')
      .replace(/'/g, singleQuoteEscapeSequence)
      .replace(/"/g, doubleQuoteEscapeSequence);
  }

  attribute() {
    return null;
  }

  value() {
    return null;
  }

  // The only way to truly check if a model matches this matcher is to run the query
  // again and check if the model is in the results. This is too expensive, so we
  // will always return true so models aren't excluded from the
  // SearchQuerySubscription result set
  evaluate() {
    return true;
  }

  whereSQL(klass) {
    const searchTable = `${klass.name}Search`;
    return `\`${
      klass.name
      }\`.\`id\` IN (SELECT \`content_id\` FROM \`${searchTable}\` WHERE \`${searchTable}\` MATCH '"${
      this.searchQuery
      }"*' LIMIT 1000)`;
  }
}

Matcher.Or = OrCompositeMatcher;
Matcher.JoinOr = JoinOrCompositeMatcher;
Matcher.And = AndCompositeMatcher;
Matcher.JoinAnd = JoinAndCompositeMatcher;
Matcher.Not = NotCompositeMatcher;
Matcher.Search = SearchMatcher;
Matcher.StructuredSearch = StructuredSearchMatcher;

export default Matcher;
