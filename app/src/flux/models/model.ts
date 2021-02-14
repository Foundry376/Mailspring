import * as Attributes from '../attributes';
import { Attribute } from '../attributes/attribute';

/**
Public: A base class for API objects that provides abstract support for
serialization and deserialization, matching by attributes, and ID-based equality.

## Attributes

`id`: {AttributeString} The resolved canonical ID of the model used in the
database and generally throughout the app. The id property is a custom
getter that resolves to the id first, and then the id.

`object`: {AttributeString} The model's type. This field is used by the JSON
 deserializer to create an instance of the correct class when inflating the object.

`accountId`: {AttributeString} The string Account Id this model belongs to.

Section: Models
 */

interface HasStaticAttributes {
  constructor: {
    attributes: {
      [attribute: string]: Attribute;
    };
  };
}

export type AttributeValues<T> = { [P in keyof T]?: any } & { __cls?: string };

type ModelAttributes = {
  id: Attribute;
  accountId: Attribute;
  version: Attribute;
  [attribute: string]: Attribute;
};

export interface ModelClass {
  new (): Model;
}

export class Model implements HasStaticAttributes {
  // @ts-ignore
  'constructor': typeof Model; // prettier-ignore

  static attributes: ModelAttributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),

    accountId: Attributes.String({
      queryable: true,
      jsonKey: 'aid',
      modelKey: 'accountId',
    }),

    version: Attributes.Number({
      queryable: false,
      jsonKey: 'v',
      modelKey: 'version',
    }),
  };

  static naturalSortOrder = () => null;

  public id: string;
  public accountId: string;
  public version: number;

  constructor(data: AttributeValues<typeof Model.attributes>) {
    if (data) {
      if (data.__cls) {
        this.fromJSON(data);
      } else {
        for (const key of Object.keys(this.constructor.attributes)) {
          if (data[key] !== undefined) {
            this[key] = data[key];
          }
        }
      }
    }
  }

  clone(): this {
    return new this.constructor(this.toJSON()) as any;
  }

  // Public: Inflates the model object from JSON, using the defined attributes to
  // guide type coercision.
  //
  // - `json` A plain Javascript {Object} with the JSON representation of the model.
  //
  // This method is chainable.
  fromJSON(json) {
    for (const key of Object.keys(this.constructor.attributes)) {
      const attr = this.constructor.attributes[key];
      const attrValue = json[attr.jsonKey || key];
      if (attrValue !== undefined) {
        this[key] = attr.fromJSON(attrValue);
      }
    }
    return this;
  }

  // Public: Deflates the model to a plain JSON object. Only attributes defined
  // on the model are included in the JSON.
  //
  // Returns an {Object} with the JSON representation of the model.
  //
  toJSON() {
    const json: any = {};
    for (const key of Object.keys(this.constructor.attributes)) {
      const attr = this.constructor.attributes[key];
      const attrValue = this[key];
      if (attrValue === undefined) {
        continue;
      }
      json[attr.jsonKey || key] = attr.toJSON(attrValue);
    }
    json.__cls = this.constructor.name;
    return json;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  // Public: Evaluates the model against one or more {Matcher} objects.
  //
  // - `criteria` An {Array} of {Matcher}s to run on the model.
  //
  // Returns true if the model matches the criteria.
  //
  matches(criteria) {
    if (!(criteria instanceof Array)) {
      return false;
    }
    for (const matcher of criteria) {
      if (!matcher.evaluate(this)) {
        return false;
      }
    }
    return true;
  }
}
