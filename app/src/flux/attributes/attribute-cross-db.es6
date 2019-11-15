import Attribute from './attribute';

const NullPlaceholder = '!NULLVALUE!';

/*
Public: Joined Data attributes allow you to store certain attributes of an
object in a separate table in the database. We use this attribute
type for Message bodies. Storing message bodies, which can be very
large, in a separate table allows us to make queries on message
metadata extremely fast, and inflate Message objects without their
bodies to build the thread list.

When building a query on a model with a JoinedData attribute, you need
to call `include` to explicitly load the joined data attribute.
The query builder will automatically perform a `LEFT OUTER JOIN` with
the secondary table to retrieve the attribute:

```javascript
DatabaseStore.find(Message, '123').then((message) => {
  // message.body is undefined
});

DatabaseStore.find(Message, '123').include(Message.attributes.body).then((message) =>
  // message.body is defined
});
```

When you call `persistModel`, JoinedData attributes are automatically
written to the secondary table.

JoinedData attributes cannot be `queryable`.

Section: Database
*/
export default class AttributeCrossDB extends Attribute {
  constructor({
    modelKey,
    jsonKey,
    joinTableColumn = null,
    joinTableKey = 'id',
    joinModelKey = 'id',
    itemClass = null,
  }) {
    super({ modelKey, jsonKey, queryable: false });
    if (!itemClass) {
      throw new Error(`AttributeCrossDB must have itemClass`);
    }
    this.itemClass = itemClass;
    this.joinDB = itemClass.db;
    this.joinTable = itemClass.name;
    this.tableColumn = joinTableColumn;
    this.joinTableKey = joinTableKey;
    this.joinModelKey = joinModelKey;
  }
  joinDBName() {
    return this.joinDB;
  }
  joinTableName() {
    return this.joinTable;
  }
  crossDBKey() {
    return `${this.joinDBName()}:${this.joinTableName()}`;
  }
}
