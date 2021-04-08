import { Model } from '../models/model';

/*
DatabaseChangeRecord is the object emitted from the DatabaseStore when it triggers.
The DatabaseChangeRecord contains information about what type of model changed,
and references to the new model values. All mutations to the database produce these
change records.
*/
export class DatabaseChangeRecord<T extends Model> {
  objects: T[];
  objectsRawJSON: Record<string, any>[];
  type: string;
  objectClass: any;

  constructor({ type, objectClass, objects, objectsRawJSON }) {
    this.objects = objects;
    this.objectsRawJSON = objectsRawJSON;
    this.type = type;
    this.objectClass = objectClass;
  }

  toJSON() {
    return {
      type: this.type,
      objectClass: this.objectClass,
      // objectsString: this._objectsString,
    };
  }
}
