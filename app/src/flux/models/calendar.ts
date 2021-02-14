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
  };

  public name: string;
  public description: string;
  public readOnly: boolean;

  constructor(data: AttributeValues<typeof Calendar.attributes>) {
    super(data);
  }
}
