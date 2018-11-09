'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var CSIFeature = JXT.define({
        name: 'clientStateIndication',
        namespace: _xmppConstants.Namespace.CSI,
        element: 'csi'
    });

    JXT.define({
        name: 'csiActive',
        eventName: 'csi:active',
        namespace: _xmppConstants.Namespace.CSI,
        element: 'active',
        topLevel: true
    });

    JXT.define({
        name: 'csiInactive',
        eventName: 'csi:inactive',
        namespace: _xmppConstants.Namespace.CSI,
        element: 'inactive',
        topLevel: true
    });

    JXT.extendStreamFeatures(CSIFeature);
};

module.exports = exports['default'];
//# sourceMappingURL=csi.js.map