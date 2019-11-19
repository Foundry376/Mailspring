/* eslint global-require: 0 */
import Attributes from '../attributes';
import QueryRange from './query-range';
import Utils from './utils';
import _ from 'underscore';

const { Matcher, AttributeJoinedData, AttributeCollection } = Attributes;

const isCrossDBAttr = attr => {
  return attr && (typeof attr.crossDBKey === 'function');
};

/*
Public: ModelQuery exposes an ActiveRecord-style syntax for building database queries
that return models and model counts. Model queries are returned from the factory methods
{DatabaseStore::find}, {DatabaseStore::findBy}, {DatabaseStore::findAll}, and {DatabaseStore::count}, and are the primary interface for retrieving data
from the app's local cache.

ModelQuery does not allow you to modify the local cache. To create, update or
delete items from the local cache, see {DatabaseStore::persistModel}
and {DatabaseStore::unpersistModel}.

**Simple Example:** Fetch a thread

```v
query = DatabaseStore.find(Thread, '123a2sc1ef4131')
query.then((thread) => ...
  // thread or null
```

**Advanced Example:** Fetch 50 threads in the inbox, in descending order

```javascript
query = DatabaseStore.findAll(Thread)
query.where([Thread.attributes.categories.contains('label-id')])
     .order([Thread.attributes.lastMessageReceivedTimestamp.descending()])
     .limit(100).offset(50)
     .then((threads) =>
  // array of threads
```

Section: Database
*/
export default class ModelQuery {
  // Public
  // - `class` A {Model} class to query
  // - `database` (optional) An optional reference to a {DatabaseStore} the
  //   query will be executed on.
  //
  constructor(klass, database) {
    this._klass = { main: klass.SubclassesUseModelTable || klass };
    this._database = database || require('./database-store').default;
    this._matchers = { main: [] };
    this._orders = { main: [] };
    this._background = false;
    this._backgroundable = true;
    this._distinct = { main: false };
    this._range = { main: QueryRange.infinite() };
    this._returnOne = { main: false };
    this._returnIds = { main: false };
    this._includeJoinedData = { main: [] };
    this._count = { main: false };
    this._logQueryPlanDebugOutput = true;
    this._crossDB = { connections: {}, valueCache: {}, link: { hasLink: false } };
    this._finalized = { main: false };
    this.parseCrossJoinDBs(Object.values(this._klass.main.attributes));
  }

  parseCrossJoinDBs = attrs => {
    for (let attr of attrs) {
      if (isCrossDBAttr(attr)) {
        const key = attr.crossDBKey();
        if (!!key) {
          if (!this._crossDB.connections[key]) {
            this._crossDB.connections[key] = {
              db: attr.joinDBName(),
              modelKey: attr.modelKey,
              columnKey: attr.tableColumn,
              joinModelKey: attr.joinModelKey,
              joinTableKey: attr.joinTableKey,
            };
          }
          if(!this._crossDB.link[key]){
            this._crossDB.link[key] = false;
          }
          if (!Array.isArray(this._crossDB.valueCache[attr.joinModelKey])) {
            this._crossDB.valueCache[attr.joinModelKey] = [];
          }
          if (!this._klass[key]) {
            this._klass[key] = attr.itemClass;
          }
          if (!Array.isArray(this._includeJoinedData[key])) {
            this._includeJoinedData[key] = [];
          }
          if (!this._range[key]) {
            this._range[key] = QueryRange.infinite();
          }
          if (!Array.isArray(this._orders[key])) {
            this._orders[key] = [];
          }
          if (!Array.isArray(this._matchers[key])) {
            this._matchers[key] = [];
          }
        }
      }
    }
  };
  linkDB(attr) {
    if (isCrossDBAttr(attr)) {
      const dbName = attr.joinDBName();
      for (let key of Object.keys(this._crossDB.connections)) {
        if (dbName === this._crossDB.connections[key].db) {
          this._crossDB.link[key] = true;
          this._crossDB.link.hasLink = true;
        }
      }
    }
    return this;
  }

  crossDBs() {
    return this._crossDB.connections;
  }
  crossDBLink(){
    return this._crossDB.link;
  }

  clone() {
    const q = new ModelQuery(this._klass.main, this._database);
    Object.keys(this._klass).forEach(key => {
      q._klass[key] = this._klass[key];
    });
    Object.keys(this._matchers).forEach(key => {
      q._matchers[key] = [].concat(this._matchers[key]);
    });
    Object.keys(this._orders).forEach(key => {
      q._orders[key] = [].concat(this._orders[key]);
    });
    q._includeJoinedData = {};
    Object.keys(this._includeJoinedData).forEach(
      key => (q._includeJoinedData[key] = [].concat(this._includeJoinedData[key]))
    );
    q._range = {};
    Object.keys(this._range).forEach(key => (q._range[key] = this._range[key].clone()));
    q._background = this._background;
    q._backgroundable = this._backgroundable;
    q._distinct = Object.assign({}, this._distinct);
    q._returnOne = Object.assign({}, this._returnOne);
    q._returnIds = Object.assign({}, this._returnIds);
    q._count = Object.assign({}, this._count);
    q._crossDB = Object.assign({}, JSON.parse(JSON.stringify(this._crossDB)));
    return q;
  }

  distinct(dbKey = 'main') {
    this._distinct[dbKey] = true;
    return this;
  }

  background() {
    if (!this._backgroundable) {
      throw new Error('Queries within transactions cannot be moved to the background.');
    }
    this._background = true;
    return this;
  }

  markNotBackgroundable() {
    this._backgroundable = false;
    return this;
  }

  silenceQueryPlanDebugOutput() {
    this._logQueryPlanDebugOutput = false;
    return this;
  }

  // Public: Add one or more where clauses to the query
  //
  // - `matchers` An {Array} of {Matcher} objects that add where clauses to the underlying query.
  //
  // This method is chainable.
  //
  where(matchers, dbKey = 'main') {
    this._assertNotFinalized(dbKey);

    if (matchers instanceof Matcher) {
      if (isCrossDBAttr(matchers.attr)) {
        this._matchers[matchers.attr.crossDBKey()].push(matchers);
      } else {
        this._matchers.main.push(matchers);
      }
    } else if (matchers instanceof Array) {
      for (const m of matchers) {
        if (!(m instanceof Matcher)) {
          throw new Error('You must provide instances of `Matcher`');
        }
        if (isCrossDBAttr(m.attr)) {
          this._matchers[m.attr.crossDBKey()].push(m);
        } else {
          this._matchers.main.push(m);
        }
      }
    } else if (matchers instanceof Object) {
      // Support a shorthand format of {id: '123', accountId: '123'}
      for (const key of Object.keys(matchers)) {
        const value = matchers[key];
          const attr = this._klass[dbKey].attributes[key];
          if (!attr) {
            const msg = `Cannot create where clause \`${key}:${value}\`. ${key} is not an attribute of ${
              this._klass[dbKey].name
            }`;
            throw new Error(msg);
          }
          if (isCrossDBAttr(attr)) {
            const obj = {};
            obj[key] = value;
            this._matchers[attr.crossDBKey()].push(obj);
          } else if (value instanceof Array) {
            this._matchers.main.push(attr.in(value));
          } else {
            this._matchers.main.push(attr.equal(value));
          }
      }
    }
    return this;
  }

  whereAny(matchers, dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._matchers[dbKey].push(new Matcher.Or(matchers));
    return this;
  }

  search(query, dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._matchers[dbKey].push(new Matcher.Search(query));
    return this;
  }

  structuredSearch(query, dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._matchers[dbKey].push(new Matcher.StructuredSearch(query));
    return this;
  }

  // Public: Include specific joined data attributes in result objects.
  // - `attr` A {AttributeJoinedData} that you want to be populated in
  //  the returned models. Note: This results in a LEFT OUTER JOIN.
  //  See {AttributeJoinedData} for more information.
  //
  // This method is chainable.
  //
  include(attr) {
    let dbKey = 'main';
    if(isCrossDBAttr(attr)){
      dbKey = attr.crossDBKey();
    }
    this._assertNotFinalized(dbKey);
    if (!(attr instanceof AttributeJoinedData)) {
      throw new Error('query.include() must be called with a joined data attribute');
    }
    this._includeJoinedData[dbKey].push(attr);
    return this;
  }

  // Public: Include all of the available joined data attributes in returned models.
  //
  // This method is chainable.
  //
  includeAll(dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    for (const key of Object.keys(this._klass[dbKey].attributes)) {
      const attr = this._klass[dbKey].attributes[key];
      if (attr instanceof AttributeJoinedData) {
        this.include(attr);
      }
    }
    return this;
  }

  // Public: Apply a sort order to the query.
  // - `orders` An {Array} of one or more {SortOrder} objects that determine the
  //   sort order of returned models.
  //
  // This method is chainable.
  //
  _pushToOrder(order) {
    const attr = order.attribute();
    if (isCrossDBAttr(attr)) {
      this._orders[attr.crossDBKey()].push(order);
    } else {
      this._orders.main.push(order);
    }
  }
  order(ordersOrOrder) {
    this._assertNotFinalized();
    const orders = ordersOrOrder instanceof Array ? ordersOrOrder : [ordersOrOrder];
    orders.forEach(order => {
      this._pushToOrder(order);
    });
    return this;
  }

  // Public: Set the `singular` flag - only one model will be returned from the
  // query, and a `LIMIT 1` clause will be used.
  //
  // This method is chainable.
  //
  one(dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._returnOne[dbKey] = true;
    return this;
  }

  // Public: Limit the number of query results.
  //
  // - `limit` {Number} The number of models that should be returned.
  //
  // This method is chainable.
  //
  limit(limit, dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    if (this._returnOne[dbKey] && limit > 1) {
      throw new Error('Cannot use limit > 1 with one()');
    }
    this._range[dbKey] = this._range[dbKey].clone();
    this._range[dbKey].limit = limit;
    return this;
  }

  // Public:
  //
  // - `offset` {Number} The start offset of the query.
  //
  // This method is chainable.
  //
  offset(offset, dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._range[dbKey] = this._range[dbKey].clone();
    this._range[dbKey].offset = offset;
    return this;
  }

  // Public:
  //
  // A convenience method for setting both limit and offset given a desired page size.
  //
  page(start, end, pageSize = 50, pagePadding = 100, dbKey = 'main') {
    const roundToPage = n => Math.max(0, Math.floor(n / pageSize) * pageSize);
    this.offset(roundToPage(start - pagePadding), dbKey);
    this.limit(roundToPage(end - start + pagePadding * 2), dbKey);
    return this;
  }

  // Public: Set the `count` flag - instead of returning inflated models,
  // the query will return the result `COUNT`.
  //
  // This method is chainable.
  //
  count(dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._count[dbKey] = true;
    return this;
  }
  isIdsOnly(dbKey = 'main'){
    return this._returnIds[dbKey];
  }

  idsOnly(dbKey = 'main') {
    this._assertNotFinalized(dbKey);
    this._returnIds[dbKey] = true;
    return this;
  }

  // Query Execution

  // Public: Short-hand syntax that calls run().then(fn) with the provided function.
  //
  // Returns a {Promise} that resolves with the Models returned by the
  // query, or rejects with an error from the Database layer.
  //
  then(next) {
    return this.run(this).then(next);
  }

  // Public: Returns a {Promise} that resolves with the Models returned by the
  // query, or rejects with an error from the Database layer.
  //
  run() {
    return this._database.run(this);
  }

  inflateResult(result, dbKey = 'main') {
    if (!result) {
      return null;
    }

    if (this._count[dbKey]) {
      console.log(`returning only count ${dbKey}`);
      return result[0].count / 1;
    }
    if (this._returnIds[dbKey]) {
      console.log(`returning only Ids ${dbKey}`);
      return result.map(row => row.id);
    }

    try {
      const ret = result.map(row => {
        let object;
        if (dbKey === 'main') {
          object = Utils.convertToModel(JSON.parse(row.data));
        } else {
          const className = this._klass[dbKey].name;
          object = Utils.getEmptyModel(className);
        }

        for (const attrName of Object.keys(this._klass[dbKey].attributes)) {
          const attr = this._klass[dbKey].attributes[attrName];
          if (!attr.needsColumn() || !attr.loadFromColumn) {
            continue;
          }
          object[attr.modelKey] = attr.fromColumn(row[attr.tableColumn]);
        }
        for (const attr of this._includeJoinedData[dbKey]) {
          let value = row[attr.tableColumn];
          if (value === AttributeJoinedData.NullPlaceholder) {
            value = null;
          }
          object[attr.modelKey] = attr.deserialize(object, value);
        }
        if (dbKey === 'main' && this._crossDB.link.hasLink) {
          for (const modelKey of Object.keys(this._crossDB.valueCache)) {
            if (
              object[modelKey] !== '' ||
              object[modelKey] !== null ||
              object[modelKey] !== undefined
            ) {
              this._crossDB.valueCache[modelKey].push(object[modelKey]);
            }
          }
        } else if (dbKey !== 'main') {
          const { modelKey, joinModelKey, joinTableKey, columnKey} = this._crossDB.connections[dbKey];
          const replaceObj =
            this._mainDBCache &&
            this._mainDBCache.find(obj => obj[joinModelKey] === object[joinTableKey]);
          if (replaceObj) {
            replaceObj[modelKey] = object[columnKey];
          }
        }
        return object;
      });
      if (Object.keys(this._klass).length > 1 && dbKey === 'main') {
        this._mainDBCache = ret;
      }
      if (dbKey === 'main') {
        return ret;
      } else {
        return this._mainDBCache;
      }
    } catch (error) {
      throw new Error(
        `Query could not parse the database result. Query: ${this.sql()}, Error: ${error.toString()}`
      );
    }
  }

  formatResult(inflated, dbKey = 'main') {
    if (this._returnOne[dbKey]) {
      // be careful not to return "undefined" if no items returned
      return inflated.length > 0 ? inflated[0] : null;
    }
    if (this._count[dbKey]) {
      return inflated;
    }
    return [].concat(inflated);
  }

  _getMuidByJoinTableName(matchers, tableName) {
    if (matchers && matchers.length && tableName) {
      for (const matcher of matchers) {
        if (matcher.attr && matcher.attr.joinTableName === tableName) {
          return matcher.joinTableRef();
        }
      }
    }
    return null;
  }

  _getSelect(allMatchers, dbKey = 'main') {
    let result = null;
    if (this._count[dbKey]) {
      result = `COUNT(*) as count`;
    } else if (this._returnIds[dbKey]) {
      result = `\`${this._klass[dbKey].name}\`.\`id\``;
    } else {
      if (dbKey === 'main') {
        result = `\`${this._klass[dbKey].name}\`.\`data\``;
      } else {
        result = `\`${this._klass[dbKey].name}\`.\`${this._crossDB.connections[dbKey].joinTableKey}\``;
      }
      for (const attrName of Object.keys(this._klass[dbKey].attributes)) {
        const attr = this._klass[dbKey].attributes[attrName];
        if (!attr.needsColumn() || !attr.loadFromColumn) {
          continue;
        }
        // get data from inner join table
        if (attr.modelTable && attr.modelTable !== this._klass[dbKey].name) {
          let tableRef = this._getMuidByJoinTableName(allMatchers, attr.modelTable);
          result += `, \`${tableRef ? tableRef : this._klass[dbKey].name}\`.\`${attr.tableColumn}\` `;
        } else {
          result += `, \`${this._klass[dbKey].name}\`.\`${attr.tableColumn}\` `;
        }
      }
      this._includeJoinedData[dbKey].forEach(attr => {
        result += `, ${attr.selectSQL(this._klass[dbKey])} `;
      });
    }
    return result;
  }

  // Query SQL Building
  // Returns a {String} with the SQL generated for the query.
  //
  sql(dbKey = 'main') {
    this.finalize(dbKey);
    const allMatchers = this.matchersFlattened(dbKey);
    const whereSql = this._whereClause(dbKey);
    const selectSql = this._getSelect(allMatchers, dbKey);
    const order = this._count[dbKey] ? '' : this._orderClause(dbKey);

    let limit = '';
    if(!this._range[dbKey]){
      console.error(`range: ${Object.keys(this._range).join(',')}`);
      console.error(`klass: ${Object.keys(this._klass).join(',')}`);
      console.error(`crossDB: ${Object.keys(this._crossDB).join(',')}`);
    }
    if (Number.isInteger(this._range[dbKey].limit)) {
      limit = `LIMIT ${this._range[dbKey].limit}`;
    } else {
      limit = '';
    }
    if (Number.isInteger(this._range[dbKey].offset)) {
      limit += ` OFFSET ${this._range[dbKey].offset}`;
    }

    const distinct = this._distinct[dbKey] ? ' DISTINCT' : '';

    const joins = allMatchers.filter(matcher => matcher.attr instanceof AttributeCollection);

    if (joins.length === 1 && this._canSubselectForJoin(joins[0], allMatchers, dbKey)) {
      const subSql = this._subselectSQL(joins[0], this._matchers[dbKey], order, limit, dbKey);
      return `SELECT ${distinct} ${selectSql} FROM \`${
        this._klass[dbKey].name
        }\` WHERE \`id\` IN (${subSql}) ${order}`;
    }


    return `SELECT ${distinct} ${selectSql} FROM \`${
      this._klass[dbKey].name
      }\` ${whereSql} ${order} ${limit}`;
  }

  // If one of our matchers requires a join, and the attribute configuration lists
  // all of the other order and matcher attributes in \`joinQueryableBy\`, it means
  // we can make the entire WHERE and ORDER BY on a sub-query, which improves
  // performance considerably vs. finding all results from the join table and then
  // doing the ordering after pulling the results in the main table.
  //
  // Note: This is currently only intended for use in the thread list
  //
  _canSubselectForJoin(matcher, allMatchers, dbKey = 'main') {
    const joinAttribute = matcher.attribute();

    if (!Number.isInteger(this._range[dbKey].limit)) {
      return false;
    }

    const allMatchersOnJoinTable = allMatchers.every(
      m =>
        m === matcher ||
        joinAttribute.joinQueryableBy.includes(m.attr.modelKey) ||
        m.attr.modelKey === 'id'
    );
    const allOrdersOnJoinTable = this._orders[dbKey].every(o =>
      joinAttribute.joinQueryableBy.includes(o.attr.modelKey)
    );

    return allMatchersOnJoinTable && allOrdersOnJoinTable;
  }

  _subselectSQL(returningMatcher, subselectMatchers, order, limit, dbKey = 'main') {
    const returningAttribute = returningMatcher.attribute();

    const table = returningAttribute.tableNameForJoinAgainst(this._klass[dbKey]);
    const wheres = subselectMatchers.map(c => c.whereSQL(this._klass[dbKey])).filter(c => !!c);

    let innerSQL = `SELECT \`id\` FROM \`${table}\` WHERE ${wheres.join(
      ' AND '
    )} ${order} ${limit}`;
    innerSQL = innerSQL.replace(new RegExp(`\`${this._klass[dbKey].name}\``, 'g'), `\`${table}\``);
    innerSQL = innerSQL.replace(
      new RegExp(`\`${returningMatcher.joinTableRef()}\``, 'g'),
      `\`${table}\``
    );
    return innerSQL;
  }

  _whereClause(dbKey = 'main') {
    let joins = [];
    this._matchers[dbKey].forEach(c => {
      const join = c.joinSQL(this._klass[dbKey]);
      if (join) {
        joins.push(join);
      }
    });
    const joinedDataTableNames = [];
    this._includeJoinedData[dbKey].forEach(attr => {
      if(!joinedDataTableNames.includes(attr.tableName())){
        joinedDataTableNames.push(attr.tableName());
        const join = attr.includeSQL(this._klass[dbKey]);
        if (join) {
          joins.push(join);
        }
      }
    });
    const wheres = [];
    this._matchers[dbKey].forEach(c => {
      const where = c.whereSQL(this._klass[dbKey]);
      if (where) {
        wheres.push(where);
      }
    });
    joins = _.flatten(joins);
    let sql = joins.join(' ');
    if (wheres.length > 0) {
      if (dbKey === 'main') {
        sql += ` WHERE ${wheres.join(' AND ')}`;
      } else {
        const modelKey = this._crossDB.connections[dbKey].joinModelKey;
        const mainDBIds = this._crossDB.valueCache[modelKey].join(`','`);
        const linkMainDB = `\`${this._klass[dbKey].name}\`.\`${this._crossDB.connections[dbKey].joinTableKey}\` in ('${mainDBIds}')`;
        console.log(`where clause for auxDB: ${linkMainDB}`);
        sql += ` WHERE ${linkMainDB} AND ${wheres.join(' AND ')}`;
      }
    } else if (wheres.length === 0 && (dbKey !== 'main')) {
      const modelKey = this._crossDB.connections[dbKey].joinModelKey;
      const mainDBIds = this._crossDB.valueCache[modelKey].join(`','`);
      const linkMainDB = `\`${this._klass[dbKey].name}\`.\`${this._crossDB.connections[dbKey].joinTableKey}\` in ('${mainDBIds}')`;
      console.log(`single where clause for auxDB: ${linkMainDB}`);
      sql += ` WHERE ${linkMainDB} `;
    }
    return sql;
  }

  _orderClause(dbKey = 'main') {
    if (this._orders[dbKey].length === 0) {
      return '';
    }

    let sql = ' ORDER BY ';
    const allMatchers = this.matchersFlattened(dbKey);
    const getJoinTableRef = attr => {
      return this._getMuidByJoinTableName(allMatchers, attr.modelTable);
    };
    this._orders[dbKey].forEach((sort, index) => {
      sql += sort.orderBySQL(this._klass[dbKey], getJoinTableRef);
      if (index !== this._orders[dbKey].length - 1 && this._orders[dbKey].length > 1) {
        sql += ' , ';
      }
    });
    return sql;
  }

  // Private: Marks the object as final, preventing any changes to the where
  // clauses, orders, etc.
  finalize(dbKey = 'main') {
    if (this._finalized[dbKey]) {
      return this;
    }

    if (this._orders[dbKey].length === 0) {
      const natural = this._klass[dbKey].naturalSortOrder();
      if (natural) {
        this._orders[dbKey].push(natural);
      }
    }

    if (this._returnOne[dbKey] && !this._range[dbKey].limit) {
      this.limit(1);
    }

    this._finalized[dbKey] = true;
    return this;
  }

  // Private: Throws an exception if the query has been frozen.
  _assertNotFinalized(dbKey = 'main') {
    if (this._finalized[dbKey]) {
      throw new Error(`ModelQuery: You cannot modify a query after calling \`then\` or \`listen\``);
    }
  }

  // Introspection
  // (These are here to make specs easy)

  matchers(dbKey = 'main') {
    return this._matchers[dbKey];
  }

  matchersFlattened(dbKey = 'main') {
    const all = [];
    const traverse = matchers => {
      if (!(matchers instanceof Array)) {
        return;
      }
      for (const m of matchers) {
        if (m.children) {
          traverse(m.children);
        } else {
          all.push(m);
        }
      }
    };
    traverse(this._matchers[dbKey]);
    return all;
  }

  matcherValueForModelKey(key, dbKey = 'main') {
    const matcher = this._matchers[dbKey].find(m => m.attr.modelKey === key);
    return matcher ? matcher.val : null;
  }

  range(dbKey = 'main') {
    return this._range[dbKey];
  }

  orderSortDescriptors(dbKey = 'main') {
    return this._orders[dbKey];
  }

  objectClass(dbKey = 'main') {
    return this._klass[dbKey].name;
  }
}
