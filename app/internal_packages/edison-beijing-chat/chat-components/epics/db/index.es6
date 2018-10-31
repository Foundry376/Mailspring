import * as contactEpics from './contact';
import * as conversationEpics from './conversation';
import * as messageEpics from './message';
import * as roomEpics from './room';

export default {
  ...contactEpics,
  ...conversationEpics,
  ...messageEpics,
  ...roomEpics
};
