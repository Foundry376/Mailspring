'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var SMFeature = JXT.define({
        name: 'streamManagement',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'sm'
    });

    JXT.define({
        name: 'smEnable',
        eventName: 'stream:management:enable',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'enable',
        topLevel: true,
        fields: {
            resume: Utils.boolAttribute('resume')
        }
    });

    JXT.define({
        name: 'smEnabled',
        eventName: 'stream:management:enabled',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'enabled',
        topLevel: true,
        fields: {
            id: Utils.attribute('id'),
            resume: Utils.boolAttribute('resume')
        }
    });

    JXT.define({
        name: 'smResume',
        eventName: 'stream:management:resume',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'resume',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0),
            previd: Utils.attribute('previd')
        }
    });

    JXT.define({
        name: 'smResumed',
        eventName: 'stream:management:resumed',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'resumed',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0),
            previd: Utils.attribute('previd')
        }
    });

    JXT.define({
        name: 'smFailed',
        eventName: 'stream:management:failed',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'failed',
        topLevel: true
    });

    JXT.define({
        name: 'smAck',
        eventName: 'stream:management:ack',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'a',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0)
        }
    });

    JXT.define({
        name: 'smRequest',
        eventName: 'stream:management:request',
        namespace: _xmppConstants.Namespace.SMACKS_3,
        element: 'r',
        topLevel: true
    });

    JXT.extendStreamFeatures(SMFeature);
};

module.exports = exports['default'];
//# sourceMappingURL=sm.js.map