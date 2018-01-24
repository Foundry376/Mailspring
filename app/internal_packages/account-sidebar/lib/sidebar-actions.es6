/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Reflux = require('reflux');

const Actions = [
  'focusAccounts',
  'setKeyCollapsed',
];

for (let idx of Array.from(Actions)) {
  Actions[idx] = Reflux.createAction(Actions[idx]);
  Actions[idx].sync = true;
}

module.exports = Actions;
