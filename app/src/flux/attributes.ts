import Matcher from './attributes/matcher';
import SortOrder from './attributes/sort-order';
import AttributeNumber from './attributes/attribute-number';
import AttributeString from './attributes/attribute-string';
import AttributeObject from './attributes/attribute-object';
import AttributeBoolean from './attributes/attribute-boolean';
import AttributeDateTime from './attributes/attribute-datetime';
import AttributeCollection from './attributes/attribute-collection';
import AttributeJoinedData from './attributes/attribute-joined-data';

export default {
  Matcher: Matcher,
  SortOrder: SortOrder,

  Number: options => new AttributeNumber(options),
  String: options => new AttributeString(options),
  Object: options => new AttributeObject(options),
  Boolean: options => new AttributeBoolean(options),
  DateTime: options => new AttributeDateTime(options),
  Collection: options => new AttributeCollection(options),
  JoinedData: options => new AttributeJoinedData(options),

  AttributeNumber: AttributeNumber,
  AttributeString: AttributeString,
  AttributeObject: AttributeObject,
  AttributeBoolean: AttributeBoolean,
  AttributeDateTime: AttributeDateTime,
  AttributeCollection: AttributeCollection,
  AttributeJoinedData: AttributeJoinedData,
};
