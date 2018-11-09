'use strict';

var extend = require('lodash.assign');
var filter = require('lodash.filter');

var JID = require('xmpp-jid').JID;


module.exports = function (client) {

    client.getBookmarks = function (cb) {
        return this.getPrivateData({bookmarks: true}, cb);
    };

    client.setBookmarks = function (opts, cb) {
        return this.setPrivateData({bookmarks: opts}, cb);
    };

    client.addBookmark = function (bookmark, cb) {
        bookmark.jid = new JID(bookmark.jid);

        return this.getBookmarks().then(function (res) {
            var bookmarks = res.privateStorage.bookmarks.conferences || [];
            var existing = filter(bookmarks, function (bm) {
                return bm.jid.bare === bookmark.jid.bare;
            });

            if (existing.length) {
                extend(existing[0], bookmark);
            } else {
                bookmarks.push(bookmark);
            }

            return client.setBookmarks({conferences: bookmarks});
        }).then(function (result) {
            if (cb) {
                cb(null, result);
            }
            return result;
        }, function (err) {
            if (cb) {
                cb(err);
            } else {
                throw err;
            }
        });
    };

    client.removeBookmark = function (jid, cb) {
        jid = new JID(jid);
        return this.getBookmarks().then(function (res) {
            var bookmarks = res.privateStorage.bookmarks.conferences || [];
            bookmarks = filter(bookmarks, function (bm) {
                return jid.bare !== bm.jid.bare;
            });
            return client.setBookmarks({conferences: bookmarks});
        }).then(function (result) {
            if (cb) {
                cb(null, result);
            }
        }, function (err) {
            if (cb) {
                cb(err);
            } else {
                throw err;
            }
        });
    };
};
