import * as contactEpics from './contact';
import * as conversationEpics from './conversation';
import * as messageEpics from './message';

export default {
  ...contactEpics,
  ...conversationEpics,
  ...messageEpics,
};
