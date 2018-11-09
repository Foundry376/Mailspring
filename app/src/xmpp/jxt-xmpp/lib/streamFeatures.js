'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var StreamFeatures = JXT.define({
        name: 'streamFeatures',
        namespace: _xmppConstants.Namespace.STREAM,
        element: 'features',
        topLevel: true
    });

    var RosterVerFeature = JXT.define({
        name: 'rosterVersioning',
        namespace: _xmppConstants.Namespace.ROSTER_VERSIONING,
        element: 'ver'
    });

    var SubscriptionPreApprovalFeature = JXT.define({
        name: 'subscriptionPreApproval',
        namespace: _xmppConstants.Namespace.SUBSCRIPTION_PREAPPROVAL,
        element: 'sub'
    });

    JXT.extendStreamFeatures(RosterVerFeature);
    JXT.extendStreamFeatures(SubscriptionPreApprovalFeature);
};

module.exports = exports['default'];
//# sourceMappingURL=streamFeatures.js.map