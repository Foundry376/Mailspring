import {
  beginStoringOccupants,
  storeConversationName
} from '../../../actions/db/conversation';

export default {
  'receive:members': beginStoringOccupants,
  'edimucconfig': storeConversationName
};
