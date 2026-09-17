import plugin from '../package.json';

export const PLUGIN_NAME = plugin.title;
export const PLUGIN_ID = plugin.name;

// MAILSPRING_IDENTITY_SERVER repoints the whole app -- identity, the sync engine,
// and these tracking URLs -- at one self-hosted backend without a rebuild, the
// same override rootURLForServer applies in app/src/flux/mailspring-api-request.ts.
// Falls back to the per-environment serverUrl in package.json when it is unset.
const override = process.env.MAILSPRING_IDENTITY_SERVER;
export const PLUGIN_URL = override
  ? override.replace(/\/+$/, '')
  : plugin.serverUrl[AppEnv.config.get('env')];
