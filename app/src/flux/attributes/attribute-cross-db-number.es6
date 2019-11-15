import AttributeCrossDB from './attribute-cross-db';
import AttributeNumber from './attribute-number';
import Utils from '../../flux/models/utils';

export default class AttributeCrossDBNumber extends Utils.multipleInheritance(
  AttributeNumber,
  AttributeCrossDB
) {
  constructor(data){
    super(data);
  }
}
