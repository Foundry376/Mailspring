'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Bind = JXT.define({
        name: 'bind',
        namespace: _xmppConstants.Namespace.BIND,
        element: 'bind',
        fields: {
            jid: Utils.jidSub(_xmppConstants.Namespace.BIND, 'jid'),
            resource: Utils.textSub(_xmppConstants.Namespace.BIND, 'resource'),
            deviceId:Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceId'),
            timestamp:Utils.textSub(_xmppConstants.Namespace.BIND, 'timestamp'),
            deviceType:Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceType'),
            deviceModel:Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceModel'),
            clientVerCode:Utils.textSub(_xmppConstants.Namespace.BIND, 'clientVerCode'),
            clientVerName:Utils.textSub(_xmppConstants.Namespace.BIND, 'clientVerName')
        }
    });

    JXT.extendIQ(Bind);
    JXT.extendStreamFeatures(Bind);
};

module.exports = exports['default'];
//# sourceMappingURL=bind.js.map