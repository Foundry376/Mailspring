'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Register = JXT.define({
        name: 'register',
        namespace: _xmppConstants.Namespace.REGISTER,
        element: 'query',
        fields: {
            instructions: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'instructions'),
            registered: Utils.boolSub(_xmppConstants.Namespace.REGISTER, 'registered'),
            remove: Utils.boolSub(_xmppConstants.Namespace.REGISTER, 'remove'),
            username: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'username'),
            nick: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'nick'),
            password: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'password'),
            name: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'name'),
            first: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'first'),
            last: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'last'),
            email: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'email'),
            address: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'address'),
            city: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'city'),
            state: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'state'),
            zip: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'zip'),
            phone: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'phone'),
            url: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'url'),
            date: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'date'),
            misc: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'misc'),
            text: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'text'),
            key: Utils.textSub(_xmppConstants.Namespace.REGISTER, 'key')
        }
    });

    JXT.extendIQ(Register);

    JXT.withDefinition('x', _xmppConstants.Namespace.OOB, function (OOB) {

        JXT.extend(Register, OOB);
    });

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Register, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=register.js.map