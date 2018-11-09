'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    JXT.define({
        name: 'rsm',
        namespace: _xmppConstants.Namespace.RSM,
        element: 'set',
        fields: {
            after: Utils.textSub(_xmppConstants.Namespace.RSM, 'after'),
            before: {
                get: function get() {

                    return Utils.getSubText(this.xml, _xmppConstants.Namespace.RSM, 'before');
                },
                set: function set(value) {

                    if (value === true) {
                        Utils.findOrCreate(this.xml, _xmppConstants.Namespace.RSM, 'before');
                    } else {
                        Utils.setSubText(this.xml, _xmppConstants.Namespace.RSM, 'before', value);
                    }
                }
            },
            count: Utils.numberSub(_xmppConstants.Namespace.RSM, 'count', false, 0),
            first: Utils.textSub(_xmppConstants.Namespace.RSM, 'first'),
            firstIndex: Utils.numberSubAttribute(_xmppConstants.Namespace.RSM, 'first', 'index'),
            index: Utils.numberSub(_xmppConstants.Namespace.RSM, 'index', false),
            last: Utils.textSub(_xmppConstants.Namespace.RSM, 'last'),
            max: Utils.numberSub(_xmppConstants.Namespace.RSM, 'max', false)
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=rsm.js.map