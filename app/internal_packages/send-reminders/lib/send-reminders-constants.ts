import plugin from '../package.json';

export const PLUGIN_ID = plugin.name;
export const PLUGIN_NAME = 'Send Reminders';

// When this pluginId is used on a draft's metadata before sending, the sync
// engine automatically promotes that metadata to the thread (stripping the
// "thread:" prefix) when the draft is sent. This avoids any client-side
// coordination after the message is sent and works regardless of how long
// the sync takes or whether the app is restarted in the interim.
export const THREAD_PLUGIN_ID = `thread:${PLUGIN_ID}`;
