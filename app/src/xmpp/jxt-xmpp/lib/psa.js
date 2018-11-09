'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var CONDITIONS = ['server-unavailable', 'connection-paused'];

exports['default'] = function (JXT) {

    var PSA = JXT.define({
        name: 'state',
        namespace: _xmppConstants.Namespace.PSA,
        element: 'state-annotation',
        fields: {
            from: JXT.utils.jidAttribute('from'),
            condition: JXT.utils.enumSub(_xmppConstants.Namespace.PSA, CONDITIONS),
            description: JXT.utils.textSub(_xmppConstants.Namespace.PSA, 'description')
        }
    });

    JXT.extendPresence(PSA);
};

module.exports = exports['default'];
//# sourceMappingURL=psa.js.map