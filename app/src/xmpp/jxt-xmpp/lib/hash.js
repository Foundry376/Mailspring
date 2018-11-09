'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    JXT.define({
        name: 'hash',
        namespace: _xmppConstants.Namespace.HASHES_1,
        element: 'hash',
        fields: {
            algo: JXT.utils.attribute('algo'),
            value: JXT.utils.text()
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=hash.js.map