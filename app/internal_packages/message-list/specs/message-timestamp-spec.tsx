/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const moment = require('moment');
const React = require('react');
const ReactTestUtils = require('react-dom/test-utils');
const MessageTimestamp = require('../lib/message-timestamp').default;

const msgTime = () => moment([2010, 1, 14, 15, 25, 50, 125]);

describe('MessageTimestamp', function() {
  beforeEach(function() {
    return (this.item = ReactTestUtils.renderIntoDocument(<MessageTimestamp date={msgTime()} />));
  });

  return it('still processes one day, even if it crosses a month divider', function() {
    // this should be tested in moment.js, but we add a test here for our own sanity too
    const feb28 = moment([2015, 1, 28]);
    const mar01 = moment([2015, 2, 1]);
    return expect(mar01.diff(feb28, 'days')).toBe(1);
  });
});
