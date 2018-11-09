'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _xmppJid = require('xmpp-jid');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var jidList = {
        get: function get() {

            var result = [];
            var items = Utils.find(this.xml, _xmppConstants.Namespace.BLOCKING, 'item');
            if (!items.length) {
                return result;
            }

            items.forEach(function (item) {

                result.push(new _xmppJid.JID(Utils.getAttribute(item, 'jid', '')));
            });

            return result;
        },
        set: function set(values) {

            var self = this;
            values.forEach(function (value) {

                var item = Utils.createElement(_xmppConstants.Namespace.BLOCKING, 'item', _xmppConstants.Namespace.BLOCKING);
                Utils.setAttribute(item, 'jid', value.toString());
                self.xml.appendChild(item);
            });
        }
    };

    var Block = JXT.define({
        name: 'block',
        namespace: _xmppConstants.Namespace.BLOCKING,
        element: 'block',
        fields: {
            jids: jidList
        }
    });

    var Unblock = JXT.define({
        name: 'unblock',
        namespace: _xmppConstants.Namespace.BLOCKING,
        element: 'unblock',
        fields: {
            jids: jidList
        }
    });

    var BlockList = JXT.define({
        name: 'blockList',
        namespace: _xmppConstants.Namespace.BLOCKING,
        element: 'blocklist',
        fields: {
            jids: jidList
        }
    });

    JXT.extendIQ(Block);
    JXT.extendIQ(Unblock);
    JXT.extendIQ(BlockList);
};

module.exports = exports['default'];
//# sourceMappingURL=blocking.js.map