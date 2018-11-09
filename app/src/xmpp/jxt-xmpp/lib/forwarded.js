'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Forwarded = JXT.define({
        name: 'forwarded',
        namespace: _xmppConstants.Namespace.FORWARD_0,
        element: 'forwarded'
    });

    JXT.withMessage(function (Message) {

        JXT.extend(Message, Forwarded);
        JXT.extend(Forwarded, Message);
    });

    JXT.withPresence(function (Presence) {

        JXT.extend(Presence, Forwarded);
        JXT.extend(Forwarded, Presence);
    });

    JXT.withIQ(function (IQ) {

        JXT.extend(IQ, Forwarded);
        JXT.extend(Forwarded, IQ);
    });

    JXT.withDefinition('delay', _xmppConstants.Namespace.DELAY, function (Delayed) {

        JXT.extend(Forwarded, Delayed);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=forwarded.js.map