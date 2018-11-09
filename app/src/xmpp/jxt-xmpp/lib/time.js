'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var EntityTime = JXT.define({
        name: 'time',
        namespace: _xmppConstants.Namespace.TIME,
        element: 'time',
        fields: {
            utc: JXT.utils.dateSub(_xmppConstants.Namespace.TIME, 'utc'),
            tzo: JXT.utils.tzoSub(_xmppConstants.Namespace.TIME, 'tzo', 0)
        }
    });

    JXT.extendIQ(EntityTime);
};

module.exports = exports['default'];
//# sourceMappingURL=time.js.map