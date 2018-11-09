'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Session = JXT.define({
        name: 'session',
        namespace: _xmppConstants.Namespace.SESSION,
        element: 'session',
        fields: {
            required: JXT.utils.boolSub(_xmppConstants.Namespace.SESSION, 'required'),
            optional: JXT.utils.boolSub(_xmppConstants.Namespace.SESSION, 'optional')
        }
    });

    JXT.extendIQ(Session);
    JXT.extendStreamFeatures(Session);
};

module.exports = exports['default'];
//# sourceMappingURL=session.js.map