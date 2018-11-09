'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Ping = JXT.define({
        name: 'ping',
        namespace: _xmppConstants.Namespace.PING,
        element: 'ping'
    });

    JXT.extendIQ(Ping);
};

module.exports = exports['default'];
//# sourceMappingURL=ping.js.map