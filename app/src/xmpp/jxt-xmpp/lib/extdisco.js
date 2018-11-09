'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Services = exports.Services = JXT.define({
        name: 'services',
        namespace: _xmppConstants.Namespace.DISCO_EXTERNAL_1,
        element: 'services',
        fields: {
            type: Utils.attribute('type')
        }
    });

    var Credentials = exports.Credentials = JXT.define({
        name: 'credentials',
        namespace: _xmppConstants.Namespace.DISCO_EXTERNAL_1,
        element: 'credentials'
    });

    var Service = JXT.define({
        name: 'service',
        namespace: _xmppConstants.Namespace.DISCO_EXTERNAL_1,
        element: 'service',
        fields: {
            host: Utils.attribute('host'),
            port: Utils.attribute('port'),
            transport: Utils.attribute('transport'),
            type: Utils.attribute('type'),
            username: Utils.attribute('username'),
            password: Utils.attribute('password')
        }
    });

    JXT.extend(Services, Service, 'services');
    JXT.extend(Credentials, Service);

    JXT.extendIQ(Services);
    JXT.extendIQ(Credentials);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Service, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=extdisco.js.map