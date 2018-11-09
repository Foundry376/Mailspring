'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var SHIM = {
        get: function get() {

            var headerSet = Utils.find(this.xml, _xmppConstants.Namespace.SHIM, 'headers');
            if (headerSet.length) {
                return Utils.getMultiSubText(headerSet[0], _xmppConstants.Namespace.SHIM, 'header', function (header) {

                    var name = Utils.getAttribute(header, 'name');
                    if (name) {
                        return {
                            name: name,
                            value: Utils.getText(header)
                        };
                    }
                });
            }
            return [];
        },
        set: function set(values) {

            var headerSet = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.SHIM, 'headers');
            JXT.setMultiSubText(headerSet, _xmppConstants.Namespace.SHIM, 'header', values, function (val) {

                var header = Utils.createElement(_xmppConstants.Namespace.SHIM, 'header', _xmppConstants.Namespace.SHIM);
                Utils.setAttribute(header, 'name', val.name);
                Utils.setText(header, val.value);
                headerSet.appendChild(header);
            });
        }
    };

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'headers', SHIM);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'headers', SHIM);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=shim.js.map