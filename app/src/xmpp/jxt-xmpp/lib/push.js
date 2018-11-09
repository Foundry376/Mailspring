'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Enable = JXT.define({
        name: 'enablePush',
        element: 'enable',
        namespace: _xmppConstants.Namespace.PUSH_0,
        fields: {
            jid: Utils.jidAttribute('jid'),
            node: Utils.attribute('node')
        }
    });

    var Disable = JXT.define({
        name: 'disablePush',
        element: 'disable',
        namespace: _xmppConstants.Namespace.PUSH_0,
        fields: {
            jid: Utils.jidAttribute('jid'),
            node: Utils.attribute('node')
        }
    });

    var Notification = JXT.define({
        name: 'pushNotification',
        element: 'notification',
        namespace: _xmppConstants.Namespace.PUSH_0
    });

    JXT.withDataForm(function (DataForm) {
        JXT.extend(Notification, DataForm);
        JXT.extend(Enable, DataForm);
    });

    JXT.extendIQ(Enable);
    JXT.extendIQ(Disable);
};

module.exports = exports['default'];
//# sourceMappingURL=push.js.map