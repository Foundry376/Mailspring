'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Version = JXT.define({
        name: 'version',
        namespace: _xmppConstants.Namespace.VERSION,
        element: 'query',
        fields: {
            name: JXT.utils.textSub(_xmppConstants.Namespace.VERSION, 'name'),
            version: JXT.utils.textSub(_xmppConstants.Namespace.VERSION, 'version'),
            os: JXT.utils.textSub(_xmppConstants.Namespace.VERSION, 'os')
        }
    });

    JXT.extendIQ(Version);
};

module.exports = exports['default'];
//# sourceMappingURL=version.js.map