import { AttributeNumber } from './attributes/attribute-number';
import { AttributeString } from './attributes/attribute-string';
import { AttributeObject } from './attributes/attribute-object';
import { AttributeBoolean } from './attributes/attribute-boolean';
import { AttributeDateTime } from './attributes/attribute-datetime';
import { AttributeCollection } from './attributes/attribute-collection';
import { AttributeJoinedData } from './attributes/attribute-joined-data';

export * from './attributes/matcher';
export * from './attributes/sort-order';
export * from './attributes/attribute-number';
export * from './attributes/attribute-string';
export * from './attributes/attribute-object';
export * from './attributes/attribute-boolean';
export * from './attributes/attribute-datetime';
export * from './attributes/attribute-collection';
export * from './attributes/attribute-joined-data';

export function Number(options: ConstructorParameters<typeof AttributeNumber>[0]) {
  return new AttributeNumber(options);
}
export function String(options: ConstructorParameters<typeof AttributeString>[0]) {
  return new AttributeString(options);
}
export function Boolean(options: ConstructorParameters<typeof AttributeBoolean>[0]) {
  return new AttributeBoolean(options);
}
export function DateTime(options: ConstructorParameters<typeof AttributeDateTime>[0]) {
  return new AttributeDateTime(options);
}
export function Collection(options: ConstructorParameters<typeof AttributeCollection>[0]) {
  return new AttributeCollection(options);
}
export function JoinedData(options: ConstructorParameters<typeof AttributeJoinedData>[0]) {
  return new AttributeJoinedData(options);
}
export function Obj(options: ConstructorParameters<typeof AttributeObject>[0]) {
  return new AttributeObject(options);
}
