const Thread = require('../../src/flux/models/thread').default;
const Folder = require('../../src/flux/models/folder').default;
const _ = require('underscore');

describe('Thread', function() {
  describe('serialization performance', () =>
    xit('1,000,000 iterations', function() {
      let iterations = 0;
      const json =
        '[{"client_id":"local-76c370af-65de","server_id":"f0vkowp7zxt7djue7ifylb940","__cls":"Thread","account_id":"1r6w6qiq3sb0o9fiwin6v87dd","snippet":"http://itunestandc.tumblr.com/tagged/itunes-terms-and-conditions/chrono _______________________________________________ http://www.macgroup.com/mailman/listinfo/smartfriends-chat","subject":"iTunes Terms And Conditions as you\'ve never seen them before","unread":true,"starred":false,"version":1,"folders":[],"labels":[{"server_id":"8cf4fn20k9pjjhjawrv3xrxo0","name":"all","display_name":"All Mail","id":"8cf4fn20k9pjjhjawrv3xrxo0"},{"server_id":"f1lq8faw8vv06m67y8f3xdf84","name":"inbox","display_name":"Inbox","id":"f1lq8faw8vv06m67y8f3xdf84"}],"participants":[{"name":"Andrew Stadler","email":"stadler@gmail.com","thirdPartyData":{}},{"name":"Smart Friends™ Chat","email":"smartfriends-chat@macgroup.com","thirdPartyData":{}}],"attachmentCount":0,"lastMessageReceivedTimestamp":1446600615,"id":"f0vkowp7zxt7djue7ifylb940"}]';
      const start = Date.now();
      while (iterations < 1000000) {
        var data;
        if (_.isString(json)) {
          data = JSON.parse(json);
        }
        const object = new Thread();
        object.fromJSON(data);
        iterations += 1;
      }
      console.log((Date.now() - start) / 1000.0 + 'ms per 1000');
    }));

  describe('sortedCategories', function() {
    const sortedForCategoryNames = function(inputs) {
      const categories = inputs.map(i => new Folder({ path: i, role: i }));
      const thread = new Thread({ labels: categories, folders: [] });
      return thread.sortedCategories();
    };

    it("puts 'important' label first, if it's present", function() {
      const inputs = ['alphabetically before important', 'important'];
      const actualOut = sortedForCategoryNames(inputs);
      expect(actualOut[0].displayName).toBe('important');
    });

    it("ignores 'important' label if not present", function() {
      const inputs = ['not important'];
      const actualOut = sortedForCategoryNames(inputs);
      expect(actualOut.length).toBe(1);
      expect(actualOut[0].displayName).toBe('not important');
    });

    it("doesn't display 'all', 'archive', or 'drafts'", function() {
      const inputs = ['all', 'archive', 'drafts'];
      const actualOut = sortedForCategoryNames(inputs);
      expect(actualOut.length).toBe(0);
    });

    it("displays standard category names which aren't hidden next, if they're present", function() {
      const inputs = ['inbox', 'important', 'social'];
      const actualOut = _.pluck(sortedForCategoryNames(inputs), 'displayName');
      const expectedOut = ['important', 'inbox', 'social'];
      expect(actualOut).toEqual(expectedOut);
    });

    it("ignores standard category names if they aren't present", function() {
      const inputs = ['social', 'work', 'important'];
      const actualOut = _.pluck(sortedForCategoryNames(inputs), 'displayName');
      const expectedOut = ['important', 'social', 'work'];
      expect(actualOut).toEqual(expectedOut);
    });

    it('puts user-added categories at the end', function() {
      const inputs = ['food', 'inbox'];
      const actualOut = _.pluck(sortedForCategoryNames(inputs), 'displayName');
      const expectedOut = ['inbox', 'food'];
      expect(actualOut).toEqual(expectedOut);
    });

    it('sorts user-added categories by displayName', function() {
      const inputs = ['work', 'social', 'receipts', 'important', 'inbox'];
      const actualOut = _.pluck(sortedForCategoryNames(inputs), 'displayName');
      const expectedOut = ['important', 'inbox', 'receipts', 'social', 'work'];
      expect(actualOut).toEqual(expectedOut);
    });
  });
});
