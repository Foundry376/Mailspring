'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var DelayedDelivery = JXT.define({
        name: 'delay',
        namespace: _xmppConstants.Namespace.DELAY,
        element: 'delay',
        fields: {
            from: Utils.jidAttribute('from'),
            stamp: Utils.dateAttribute('stamp'),
            reason: Utils.text()
        }
    });

    JXT.extendMessage(DelayedDelivery);
    JXT.extendPresence(DelayedDelivery);
};

module.exports = exports['default'];
//# sourceMappingURL=delayed.js.map