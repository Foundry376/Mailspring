/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Reflux = require('reflux');

export const focusAccounts = Reflux.createAction('focusAccounts');
focusAccounts.sync = true;

export const setKeyCollapsed = Reflux.createAction('setKeyCollapsed');
setKeyCollapsed.sync = true;
