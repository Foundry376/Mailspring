import AttributeCrossDB from './attribute-cross-db';
import AttributeString from './attribute-string';
import Utils from '../../flux/models/utils';

export default class AttributeCrossDBString extends Utils.multipleInheritance(
  AttributeString,
  AttributeCrossDB
) {
  constructor(data){
    super(data);
  }
}
