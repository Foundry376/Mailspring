'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Sent = JXT.define({
        name: 'carbonSent',
        eventName: 'carbon:sent',
        namespace: _xmppConstants.Namespace.CARBONS_2,
        element: 'sent'
    });

    var Received = JXT.define({
        name: 'carbonReceived',
        eventName: 'carbon:received',
        namespace: _xmppConstants.Namespace.CARBONS_2,
        element: 'received'
    });

    var Private = JXT.define({
        name: 'carbonPrivate',
        eventName: 'carbon:private',
        namespace: _xmppConstants.Namespace.CARBONS_2,
        element: 'private'
    });

    var Enable = JXT.define({
        name: 'enableCarbons',
        namespace: _xmppConstants.Namespace.CARBONS_2,
        element: 'enable'
    });

    var Disable = JXT.define({
        name: 'disableCarbons',
        namespace: _xmppConstants.Namespace.CARBONS_2,
        element: 'disable'
    });

    JXT.withDefinition('forwarded', _xmppConstants.Namespace.FORWARD_0, function (Forwarded) {

        JXT.extend(Sent, Forwarded);
        JXT.extend(Received, Forwarded);
    });

    JXT.extendMessage(Sent);
    JXT.extendMessage(Received);
    JXT.extendMessage(Private);
    JXT.extendIQ(Enable);
    JXT.extendIQ(Disable);
};

module.exports = exports['default'];
//# sourceMappingURL=carbons.js.map