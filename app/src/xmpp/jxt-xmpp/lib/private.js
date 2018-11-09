'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var PrivateStorage = JXT.define({
        name: 'privateStorage',
        namespace: _xmppConstants.Namespace.PRIVATE,
        element: 'query'
    });

    JXT.extendIQ(PrivateStorage);
};

module.exports = exports['default'];
//# sourceMappingURL=private.js.map