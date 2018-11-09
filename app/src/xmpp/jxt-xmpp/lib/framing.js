'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    JXT.define({
        name: 'openStream',
        namespace: _xmppConstants.Namespace.FRAMING,
        element: 'open',
        topLevel: true,
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            version: Utils.attribute('version', '1.0'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true),
            timestamp:Utils.attribute('timestamp')// yazz
        }
    });

    JXT.define({
        name: 'closeStream',
        namespace: _xmppConstants.Namespace.FRAMING,
        element: 'close',
        topLevel: true,
        fields: {
            seeOtherURI: Utils.attribute('see-other-uri')
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=framing.js.map