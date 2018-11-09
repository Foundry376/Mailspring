'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Hat = JXT.define({
        name: '_hat',
        namespace: _xmppConstants.Namespace.HATS_0,
        element: 'hat',
        fields: {
            lang: JXT.utils.langAttribute(),
            name: JXT.utils.attribute('name'),
            displayName: JXT.utils.attribute('displayName')
        }
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'hats', JXT.utils.subMultiExtension(_xmppConstants.Namespace.HATS_0, 'hats', Hat));
    });
};

module.exports = exports['default'];
//# sourceMappingURL=hats.js.map