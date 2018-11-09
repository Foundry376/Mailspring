'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'visible', JXT.utils.boolSub(_xmppConstants.Namespace.INVISIBLE_0, 'visible'));
        JXT.add(IQ, 'invisible', JXT.utils.boolSub(_xmppConstants.Namespace.INVISIBLE_0, 'invisible'));
    });
};

module.exports = exports['default'];
//# sourceMappingURL=visibility.js.map