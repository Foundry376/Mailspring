'use strict';

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _lodashForeach = require('lodash.foreach');

var _lodashForeach2 = _interopRequireDefault(_lodashForeach);

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var ReachURI = JXT.define({
        name: '_reachAddr',
        namespace: _xmppConstants.Namespace.REACH_0,
        element: 'addr',
        fields: {
            uri: Utils.attribute('uri'),
            $desc: {
                get: function get() {

                    return Utils.getSubLangText(this.xml, _xmppConstants.Namespace.REACH_0, 'desc', this.lang);
                }
            },
            desc: {
                get: function get() {

                    var descs = this.$desc;
                    return descs[this.lang] || '';
                },
                set: function set(value) {

                    Utils.setSubLangText(this.xml, _xmppConstants.Namespace.REACH_0, 'desc', value, this.lang);
                }
            }
        }
    });

    var reachability = {
        get: function get() {

            var reach = Utils.find(this.xml, _xmppConstants.Namespace.REACH_0, 'reach');
            var results = [];
            if (reach.length) {
                var addrs = Utils.find(reach[0], _xmppConstants.Namespace.REACH_0, 'addr');
                (0, _lodashForeach2['default'])(addrs, function (addr) {

                    results.push(new ReachURI({}, addr));
                });
            }
            return results;
        },
        set: function set(value) {

            var reach = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.REACH_0, 'reach');
            Utils.setAttribute(reach, 'xmlns', _xmppConstants.Namespace.REACH_0);
            (0, _lodashForeach2['default'])(value, function (info) {

                var addr = new ReachURI(info);
                reach.appendChild(addr.xml);
            });
        }
    };

    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'reach', reachability);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'reach', reachability);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=reach.js.map