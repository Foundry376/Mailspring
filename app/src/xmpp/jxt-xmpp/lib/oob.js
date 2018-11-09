'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var OOB = JXT.define({
        name: 'oob',
        element: 'x',
        namespace: _xmppConstants.Namespace.OOB,
        fields: {
            url: JXT.utils.textSub(_xmppConstants.Namespace.OOB, 'url'),
            desc: JXT.utils.textSub(_xmppConstants.Namespace.OOB, 'desc')
        }
    });

    var OOB_IQ = JXT.define({
        name: 'oob',
        element: 'query',
        namespace: _xmppConstants.Namespace.OOB_IQ,
        fields: {
            url: JXT.utils.textSub(_xmppConstants.Namespace.OOB, 'url'),
            desc: JXT.utils.textSub(_xmppConstants.Namespace.OOB, 'desc')
        }
    });

    JXT.extendMessage(OOB, 'oobURIs');
    JXT.extendIQ(OOB_IQ);
};

module.exports = exports['default'];
//# sourceMappingURL=oob.js.map