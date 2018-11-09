'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Log = JXT.define({
        name: 'log',
        namespace: _xmppConstants.Namespace.EVENTLOG,
        element: 'log',
        fields: {
            id: Utils.attribute('id'),
            timestamp: Utils.dateAttribute('timestamp'),
            type: Utils.attribute('type'),
            level: Utils.attribute('level'),
            object: Utils.attribute('object'),
            subject: Utils.attribute('subject'),
            facility: Utils.attribute('facility'),
            module: Utils.attribute('module'),
            message: Utils.textSub(_xmppConstants.Namespace.EVENTLOG, 'message'),
            stackTrace: Utils.textSub(_xmppConstants.Namespace.EVENTLOG, 'stackTrace')
        }
    });

    var Tag = JXT.define({
        name: '_logtag',
        namespace: _xmppConstants.Namespace.EVENTLOG,
        element: 'tag',
        fields: {
            name: Utils.attribute('name'),
            value: Utils.attribute('value'),
            type: Utils.attribute('type')
        }
    });

    JXT.extend(Log, Tag, 'tags');

    JXT.extendMessage(Log);
    JXT.extendPubsubItem(Log);
};

module.exports = exports['default'];
//# sourceMappingURL=logging.js.map