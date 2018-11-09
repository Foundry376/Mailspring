'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Address = JXT.define({
        name: '_address',
        namespace: _xmppConstants.Namespace.ADDRESS,
        element: 'address',
        fields: {
            jid: Utils.jidAttribute('jid'),
            uri: Utils.attribute('uri'),
            node: Utils.attribute('node'),
            description: Utils.attribute('desc'),
            delivered: Utils.boolAttribute('delivered'),
            type: Utils.attribute('type')
        }
    });

    var Addresses = Utils.subMultiExtension(_xmppConstants.Namespace.ADDRESS, 'addresses', Address);

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'addresses', Addresses);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'addresses', Addresses);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=addresses.js.map