'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Conference = JXT.define({
        name: '_conference',
        namespace: _xmppConstants.Namespace.BOOKMARKS,
        element: 'conference',
        fields: {
            name: Utils.attribute('name'),
            autoJoin: Utils.boolAttribute('autojoin'),
            jid: Utils.jidAttribute('jid'),
            nick: Utils.textSub(_xmppConstants.Namespace.BOOKMARKS, 'nick')
        }
    });

    var Bookmarks = JXT.define({
        name: 'bookmarks',
        namespace: _xmppConstants.Namespace.BOOKMARKS,
        element: 'storage'
    });

    JXT.extend(Bookmarks, Conference, 'conferences');

    JXT.withDefinition('query', _xmppConstants.Namespace.PRIVATE, function (PrivateStorage) {

        JXT.extend(PrivateStorage, Bookmarks);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=bookmarks.js.map