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

    var UserItem = JXT.define({
        name: '_mucUserItem',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_USER, 'reason')
        }
    });

    var UserActor = JXT.define({
        name: '_mucUserActor',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'actor',
        fields: {
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid')
        }
    });

    var Destroyed = JXT.define({
        name: 'destroyed',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'destroy',
        fields: {
            jid: Utils.jidAttribute('jid'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_USER, 'reason')
        }
    });

    var Invite = JXT.define({
        name: 'invite',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'invite',
        fields: {
            to: Utils.jidAttribute('to'),
            from: Utils.jidAttribute('from'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_USER, 'reason'),
            thread: Utils.subAttribute(_xmppConstants.Namespace.MUC_USER, 'continue', 'thread'),
            'continue': Utils.boolSub(_xmppConstants.Namespace.MUC_USER, 'continue')
        }
    });

    var Decline = JXT.define({
        name: 'decline',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'decline',
        fields: {
            to: Utils.jidAttribute('to'),
            from: Utils.jidAttribute('from'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_USER, 'reason')
        }
    });

    var AdminItem = JXT.define({
        name: '_mucAdminItem',
        namespace: _xmppConstants.Namespace.MUC_ADMIN,
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            name: Utils.attribute('name'),
            email: Utils.attribute('email'),
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_ADMIN, 'reason')
        }
    });

    var AdminActor = JXT.define({
        name: 'actor',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'actor',
        fields: {
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid')
        }
    });

    var Destroy = JXT.define({
        name: 'destroy',
        namespace: _xmppConstants.Namespace.MUC_OWNER,
        element: 'destroy',
        fields: {
            jid: Utils.jidAttribute('jid'),
            password: Utils.textSub(_xmppConstants.Namespace.MUC_OWNER, 'password'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_OWNER, 'reason')
        }
    });

    var MUC = JXT.define({
        name: 'muc',
        namespace: _xmppConstants.Namespace.MUC_USER,
        element: 'x',
        fields: {
            affiliation: proxy('_mucUserItem', 'affiliation'),
            nick: proxy('_mucUserItem', 'nick'),
            jid: proxy('_mucUserItem', 'jid'),
            role: proxy('_mucUserItem', 'role'),
            actor: proxy('_mucUserItem', '_mucUserActor'),
            reason: proxy('_mucUserItem', 'reason'),
            password: Utils.textSub(_xmppConstants.Namespace.MUC_USER, 'password'),
            codes: {
                get: function get() {

                    return Utils.getMultiSubText(this.xml, _xmppConstants.Namespace.MUC_USER, 'status', function (sub) {

                        return Utils.getAttribute(sub, 'code');
                    });
                },
                set: function set(value) {

                    var self = this;
                    Utils.setMultiSubText(this.xml, _xmppConstants.Namespace.MUC_USER, 'status', value, function (val) {

                        var child = Utils.createElement(_xmppConstants.Namespace.MUC_USER, 'status', _xmppConstants.Namespace.MUC_USER);
                        Utils.setAttribute(child, 'code', val);
                        self.xml.appendChild(child);
                    });
                }
            }
        }
    });

    var MUCAdmin = JXT.define({
        name: 'mucAdmin',
        namespace: _xmppConstants.Namespace.MUC_ADMIN,
        element: 'query',
        fields: {
            ver: Utils.attribute('ver'),
            affiliation: proxy('_mucAdminItem', 'affiliation'),
            nick: proxy('_mucAdminItem', 'nick'),
            jid: proxy('_mucAdminItem', 'jid'),
            role: proxy('_mucAdminItem', 'role'),
            actor: proxy('_mucAdminItem', '_mucAdminActor'),
            reason: proxy('_mucAdminItem', 'reason')
        }
    });

    var MUCOwner = JXT.define({
        name: 'mucOwner',
        namespace: _xmppConstants.Namespace.MUC_OWNER,
        element: 'query'
    });

    var MUCJoin = JXT.define({
        name: 'joinMuc',
        namespace: _xmppConstants.Namespace.MUC,
        element: 'x',
        fields: {
            password: Utils.textSub(_xmppConstants.Namespace.MUC, 'password'),
            history: {
                get: function get() {

                    var result = {};
                    var hist = Utils.find(this.xml, _xmppConstants.Namespace.MUC, 'history');

                    if (!hist.length) {
                        return {};
                    }
                    hist = hist[0];

                    var maxchars = hist.getAttribute('maxchars') || '';
                    var maxstanzas = hist.getAttribute('maxstanzas') || '';
                    var seconds = hist.getAttribute('seconds') || '';
                    var since = hist.getAttribute('since') || '';

                    if (maxchars) {
                        result.maxchars = parseInt(maxchars, 10);
                    }
                    if (maxstanzas) {
                        result.maxstanzas = parseInt(maxstanzas, 10);
                    }
                    if (seconds) {
                        result.seconds = parseInt(seconds, 10);
                    }
                    if (since) {
                        result.since = new Date(since);
                    }
                },
                set: function set(opts) {

                    var existing = Utils.find(this.xml, _xmppConstants.Namespace.MUC, 'history');
                    if (existing.length) {
                        for (var i = 0; i < existing.length; i++) {
                            this.xml.removeChild(existing[i]);
                        }
                    }

                    var hist = Utils.createElement(_xmppConstants.Namespace.MUC, 'history', _xmppConstants.Namespace.MUC);
                    this.xml.appendChild(hist);

                    if (opts.maxchars) {
                        hist.setAttribute('maxchars', '' + opts.maxchars);
                    }
                    if (opts.maxstanzas) {
                        hist.setAttribute('maxstanzas', '' + opts.maxstanzas);
                    }
                    if (opts.seconds) {
                        hist.setAttribute('seconds', '' + opts.seconds);
                    }
                    if (opts.since) {
                        hist.setAttribute('since', opts.since.toISOString());
                    }
                }
            }
        }
    });

    var DirectInvite = JXT.define({
        name: 'mucInvite',
        namespace: _xmppConstants.Namespace.MUC_DIRECT_INVITE,
        element: 'x',
        fields: {
            jid: Utils.jidAttribute('jid'),
            password: Utils.attribute('password'),
            reason: Utils.attribute('reason'),
            thread: Utils.attribute('thread'),
            'continue': Utils.boolAttribute('continue')
        }
    });

    var EdiItem = JXT.define({
        name: '_mucEdiItem',
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            nick: Utils.attribute('nick'),
            nickname: Utils.attribute('nickname'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(_xmppConstants.Namespace.MUC_ADMIN, 'reason')
        }
    });
    // var MUCMember = JXT.define({
    //     name: '_mucMember',
    //     element: 'member',
    //     fields: {
    //         jid: Utils.jidAttribute('jid')
    //     }
    // });
    var MUCMembers = JXT.define({
        name: '_mucMembers',
        element: 'members',
        fields: {
            jid: {
                set: function setJid(values) {
                    for (let i in values) {
                        Utils.setSubAttribute(this.xml, '', 'member', 'jid', values[i]);
                    }
                },
                get: function getJid() {

                }
            }
        }
    });

    var Edimuc = JXT.define({//yazz
        name: 'edimuc',
        element: 'edimuc',
        fields: {
            type: Utils.attribute('type'),
            subject: Utils.textSub('', 'subject'),
            name: Utils.textSub('', 'name'),
            description: Utils.textSub('', 'description'),
            members: Utils.textSub('', 'members'),
        }
    });
    var EdimucConfig = JXT.define({
        name: 'edimucconfig',
        namespace: 'edimucconfig',
        element: 'edimucconfig',
        fields: {
            subject: Utils.textSub('', 'subject'),
            name: Utils.textSub('', 'name'),
            description: Utils.textSub('', 'description')
        }
    });
    var EdimucProfile = JXT.define({
        name: 'edimucprofile',
        namespace: 'edimucprofile',
        element: 'edimucprofile',
        fields: {
            jid: proxy('_mucEdiItem', 'jid'),
            nickname: proxy('_mucEdiItem', 'nickname')
        }
    });
    var MucQuery = JXT.define({
        name: 'ediQuery',
        //namespace: Utils.attribute('xmlns'),//_xmppConstants.Namespace.DISCO_ITEMS,
        element: 'query',
        fields: {
            xmlns: Utils.attribute('xmlns'),//_xmppConstants.Namespace.DISCO_ITEMS,
            ver: Utils.attribute('ver')
        }
    });
    //JXT.extend(MUCMembers, MUCMember);
    JXT.extend(Edimuc, MUCMembers);
    JXT.extend(EdimucProfile, EdiItem);

    JXT.extend(UserItem, UserActor);
    JXT.extend(MUC, UserItem);
    JXT.extend(MUC, Invite, 'invites');
    JXT.extend(MUC, Decline);
    JXT.extend(MUC, Destroyed);
    JXT.extend(AdminItem, AdminActor);
    JXT.extend(MUCAdmin, AdminItem, 'items');
    JXT.extend(MUCOwner, Destroy);


    JXT.extendPresence(MUC);
    JXT.extendPresence(MUCJoin);

    JXT.extendMessage(MUC);
    JXT.extendMessage(DirectInvite);

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'mucUnique', Utils.textSub(_xmppConstants.Namespace.MUC_UNIQUE, 'unique'));
        JXT.extend(IQ, MUCAdmin);
        JXT.extend(IQ, MUCOwner);
        JXT.extend(IQ, Edimuc);
        JXT.extend(IQ, MucQuery);
        JXT.extend(IQ, EdimucProfile);
        JXT.extend(IQ, EdimucConfig);
    });

    JXT.withDataForm(function (DataForm) {

        JXT.extend(MUCOwner, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=muc.js.map