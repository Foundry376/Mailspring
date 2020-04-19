import { Attribute } from './attribute';
import { Model } from '../models/model';

/*
Public: Represents a particular sort direction on a particular column. You should not
instantiate SortOrders manually. Instead, call {Attribute::ascending} or
{Attribute::descending} to obtain a sort order instance:

```javascript
DatabaseStore.findBy<Message>(Message)
  .where({threadId: threadId, draft: false})
  .order(Message.attributes.date.descending()).then((messages) =>

```

Section: Database
*/
export class SortOrder {
  public attr: Attribute;
  public direction: 'ASC' | 'DESC';

  constructor(attr: Attribute, direction: 'ASC' | 'DESC' = 'DESC') {
    this.attr = attr;
    this.direction = direction;
  }

  orderBySQL(klass: typeof Model) {
    return `\`${klass.name}\`.\`${this.attr.tableColumn}\` ${this.direction}`;
  }

  attribute() {
    return this.attr;
  }
}
