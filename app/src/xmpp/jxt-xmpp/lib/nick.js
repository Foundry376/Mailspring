'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var nick = JXT.utils.textSub(_xmppConstants.Namespace.NICK, 'nick');

    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'nick', nick);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'nick', nick);
    });

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'nick', nick);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=nick.js.map