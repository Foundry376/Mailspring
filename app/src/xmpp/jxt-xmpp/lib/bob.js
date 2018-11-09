'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var BOB = JXT.define({
        name: 'bob',
        namespace: _xmppConstants.Namespace.BOB,
        element: 'data',
        fields: {
            cid: Utils.attribute('cid'),
            maxAge: Utils.numberAttribute('max-age'),
            type: Utils.attribute('type'),
            data: Utils.text()
        }
    });

    JXT.extendIQ(BOB);
    JXT.extendMessage(BOB);
    JXT.extendPresence(BOB);
};

module.exports = exports['default'];
//# sourceMappingURL=bob.js.map