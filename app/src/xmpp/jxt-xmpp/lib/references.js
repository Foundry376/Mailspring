'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Reference = JXT.define({
        name: 'reference',
        element: 'reference',
        namespace: _xmppConstants.Namespace.REFERENCE_0,
        fields: {
            type: Utils.attribute('type'),
            begin: Utils.numberAttribute('begin'),
            end: Utils.numberAttribute('end'),
            uri: Utils.attribute('uri'),
            anchor: Utils.attribute('anchor')
        }
    });

    var References = Utils.multiExtension(Reference);

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'references', References);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=references.js.map