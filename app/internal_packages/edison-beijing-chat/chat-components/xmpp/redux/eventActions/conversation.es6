import {
  beginStoringOccupants,
} from '../../../actions/db/conversation';

export default {
  'receive:members': beginStoringOccupants
};
