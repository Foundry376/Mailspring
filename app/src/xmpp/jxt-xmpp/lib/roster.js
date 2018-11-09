'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Roster = JXT.define({
        name: 'roster',
        namespace: _xmppConstants.Namespace.ROSTER,
        element: 'query',
        fields: {
            ver: {
                get: function get() {

                    return Utils.getAttribute(this.xml, 'ver');
                },
                set: function set(value) {

                    var force = value === '';
                    Utils.setAttribute(this.xml, 'ver', value, force);
                }
            }
        }
    });

    var RosterItem = JXT.define({
        name: '_rosterItem',
        namespace: _xmppConstants.Namespace.ROSTER,
        element: 'item',
        fields: {
            jid: Utils.jidAttribute('jid', true),
            name: Utils.attribute('name'),
            subscription: Utils.attribute('subscription', 'none'),
            subscriptionRequested: {
                get: function get() {
                    var ask = Utils.getAttribute(this.xml, 'ask');
                    return ask === 'subscribe';
                }
            },
            preApproved: Utils.boolAttribute(_xmppConstants.Namespace.ROSTER, 'approved'),
            groups: Utils.multiTextSub(_xmppConstants.Namespace.ROSTER, 'group'),
            email:{
                get:function get(){
                    return Utils.getAttribute(this.xml, 'email');
                }
            },
            oriName:{
                get:function get(){
                    return Utils.getAttribute(this.xml, 'oriName');
                }
            },
            avatar:{
                get:function get(){
                    return Utils.getAttribute(this.xml, 'avatar');
                }
            }
        }
    });
    JXT.extend(Roster, RosterItem, 'items');

    JXT.extendIQ(Roster);
};

module.exports = exports['default'];
//# sourceMappingURL=roster.js.map