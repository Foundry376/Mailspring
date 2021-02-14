import { Attribute } from './attribute';
import { Matcher } from './matcher';
import { Model } from '../models/model';

/*
Public: Collection attributes provide basic support for one-to-many relationships.
For example, Threads in Mailspring have a collection of Labels or Folders.

When Collection attributes are marked as `queryable`, the DatabaseStore
automatically creates a join table and maintains it as you create, save,
and delete models. When you call `persistModel`, entries are added to the
join table associating the ID of the model with the IDs of models in the collection.

Collection attributes have an additional clause builder, `contains`:

```javascript
DatabaseStore.findAll<Thread>(Thread).where([Thread.attributes.categories.contains('inbox')])
```

This is equivalent to writing the following SQL:

```sql
SELECT `Thread`.`data` FROM `Thread`
INNER JOIN `ThreadLabel` AS `M1` ON `M1`.`id` = `Thread`.`id`
WHERE `M1`.`value` = 'inbox'
ORDER BY `Thread`.`lastMessageReceivedTimestamp` DESC
```

The value of this attribute is always an array of other model objects.

Section: Database
*/
export class AttributeCollection extends Attribute {
  itemClass: typeof Model;
  joinOnField: string;
  joinTableName: string;
  joinQueryableBy: string[];

  constructor({
    modelKey,
    jsonKey,
    queryable,
    itemClass,
    joinOnField,
    joinQueryableBy,
    joinTableName,
  }: ConstructorParameters<typeof Attribute>[0] & {
    itemClass?: typeof Model;
    joinOnField?: string;
    joinTableName?: string;
    joinQueryableBy?: string[];
  }) {
    super({ modelKey, jsonKey, queryable });
    this.itemClass = itemClass;
    this.joinOnField = joinOnField;
    this.joinTableName = joinTableName;
    this.joinQueryableBy = joinQueryableBy || [];
  }

  toJSON(vals: (object | Model)[]) {
    if (!vals) {
      return [];
    }

    if (!(vals instanceof Array)) {
      throw new Error(`AttributeCollection::toJSON: ${this.modelKey} is not an array.`);
    }

    return vals.map(val => {
      if (this.itemClass && !(val instanceof this.itemClass)) {
        throw new Error(
          `AttributeCollection::toJSON: Value \`${val}\` in ${this.modelKey} is not an ${this.itemClass.name}`
        );
      }
      return val && typeof val === 'object' && 'toJSON' in val ? val.toJSON() : val;
    });
  }

  fromJSON(json: object[]) {
    const Klass = this.itemClass;

    if (!json || !(json instanceof Array)) {
      return [];
    }
    return json.map(objJSON => {
      if (!objJSON || !Klass || objJSON instanceof Klass) {
        return objJSON;
      }
      return new Klass(objJSON);
    });
  }

  // Private: The Matcher interface uses this method to determine how to
  // constuct a SQL join:
  tableNameForJoinAgainst(primaryKlass) {
    return this.joinTableName || `${primaryKlass.name}${this.itemClass.name}`;
  }

  // Public: Returns a {Matcher} for objects containing the provided value.
  contains(val: string) {
    this._assertPresentAndQueryable('contains', val);
    return new Matcher(this, 'contains', val);
  }

  containsAny(vals: string[]) {
    this._assertPresentAndQueryable('contains', vals);
    return new Matcher(this, 'containsAny', vals);
  }
}
