'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    JXT.define({
        name: 'stream',
        namespace: _xmppConstants.Namespace.STREAM,
        element: 'stream',
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            version: Utils.attribute('version', '1.0'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true)
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=stream.js.map