import { Model, AttributeValues } from './model';
import * as Attributes from '../attributes';

/**
Public: The Calendar model represents a Calendar object.

## Attributes

`name`: {AttributeString} The name of the calendar.

`description`: {AttributeString} The description of the calendar.

This class also inherits attributes from {Model}

Section: Models
*/
export class Calendar extends Model {
  static attributes = {
    ...Model.attributes,

    name: Attributes.String({
      modelKey: 'name',
      jsonKey: 'name',
    }),
    description: Attributes.String({
      modelKey: 'description',
      jsonKey: 'description',
    }),
    readOnly: Attributes.Boolean({
      modelKey: 'readOnly',
      jsonKey: 'read_only',
    }),
    ownership: Attributes.String({
      modelKey: 'ownership',
      jsonKey: 'owner',
    }),
    path: Attributes.String({
      modelKey: 'path',
      jsonKey: 'path',
    }),
    color: Attributes.String({
      modelKey: 'color',
      jsonKey: 'color',
    }),
    order: Attributes.Number({
      modelKey: 'order',
      jsonKey: 'order',
    }),
  };

  public name: string;
  public description: string;
  public readOnly: boolean;
  /** The server's DAV:owner verdict (RFC 3744 section 5.1); '' when it gave none. */
  public ownership: 'mine' | 'other' | '';
  /** The collection's href on the server; Google puts the calendar's own address in it. */
  public path: string;
  public color: string;
  public order: number;

  constructor(data: AttributeValues<typeof Calendar.attributes>) {
    super(data);
  }
}
