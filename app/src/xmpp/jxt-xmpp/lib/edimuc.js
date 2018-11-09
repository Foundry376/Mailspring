'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

function proxy(child, field) {

    return {
        get: function get() {

            if (this._extensions[child]) {
                return this[child][field];
            }
        },
        set: function set(value) {

            this[child][field] = value;
        }
    };
}

exports['default'] = function (JXT) {

    var Utils = JXT.utils;
    var MUCAdmin = JXT.define({
        name: 'mucAdmin',
        namespace: _xmppConstants.Namespace.MUC_ADMIN,
        element: 'query',
        fields: {
            affiliation: proxy('_mucAdminItem', 'affiliation'),
            nick: proxy('_mucAdminItem', 'nick'),
            jid: proxy('_mucAdminItem', 'jid'),
            role: proxy('_mucAdminItem', 'role'),
            actor: proxy('_mucAdminItem', '_mucAdminActor'),
            reason: proxy('_mucAdminItem', 'reason')
        }
    });
    var AdminItem = JXT.define({
        name: '_mucAdminItem',
        namespace: _xmppConstants.Namespace.MUC_ADMIN,
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_ADMIN, 'reason')
        }
    });

    var MucQuery = JXT.define({
        name: 'query',
        namespace: Utils.attribute('xmlns'),//_xmppConstants.Namespace.DISCO_ITEMS,
        element: 'query',
        fields: {
            ver: Utils.attribute('ver')
        }
    });
    var UserItem = JXT.define({
        name: '_mucUserItem',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'item',
        fields: {
            room_info_version: Utils.attribute('room_info_version'),
            name: Utils.attribute('name'),
            jid: Utils.jidAttribute('jid'),
            ver: Utils.attribute('ver'),
            affiliation:Utils.attribute('affiliation')
        }
    });
    var Edimuc = JXT.define({//yazz
        name: 'edimuc',
        element: 'edimuc',
        fields: {
            type: Utils.attribute('type'),
            resource: Utils.textSub('', 'resource'),
            name: Utils.textSub('', 'name'),
            description: Utils.textSub('', 'description'),
            members: Utils.textSub('', 'members')
        }
    });
    JXT.extend(MucQuery, UserItem, 'items');
    JXT.withIQ(function (IQ) {
        JXT.extend(IQ, Edimuc);
        JXT.extend(IQ, MucQuery);
    });

};

module.exports = exports['default'];
//# sourceMappingURL=muc.js.map