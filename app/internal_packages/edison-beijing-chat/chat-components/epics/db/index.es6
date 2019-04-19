import * as contactEpics from './contact';
import * as conversationEpics from './conversation';
import * as messageEpics from './message';
import * as roomEpics from './room';
import * as configEpics from './config';

export default {
  ...contactEpics,
  ...conversationEpics,
  ...messageEpics,
  ...roomEpics,
  ...configEpics
};
