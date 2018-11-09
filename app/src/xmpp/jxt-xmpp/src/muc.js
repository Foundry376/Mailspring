import { Namespace as NS } from 'xmpp-constants';


function proxy (child, field) {

    return {
        get: function () {

            if (this._extensions[child]) {
                return this[child][field];
            }
        },
        set: function (value) {

            this[child][field] = value;
        }
    };
}


export default function (JXT) {

    let Utils = JXT.utils;

    let UserItem = JXT.define({
        name: '_mucUserItem',
        namespace: NS.MUC_USER,
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(NS.MUC_USER, 'reason')
        }
    });

    let UserActor = JXT.define({
        name: '_mucUserActor',
        namespace: NS.MUC_USER,
        element: 'actor',
        fields: {
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid')
        }
    });

    let Destroyed = JXT.define({
        name: 'destroyed',
        namespace: NS.MUC_USER,
        element: 'destroy',
        fields: {
            jid: Utils.jidAttribute('jid'),
            reason: Utils.textSub(NS.MUC_USER, 'reason')
        }
    });

    let Invite = JXT.define({
        name: 'invite',
        namespace: NS.MUC_USER,
        element: 'invite',
        fields: {
            to: Utils.jidAttribute('to'),
            from: Utils.jidAttribute('from'),
            reason: Utils.textSub(NS.MUC_USER, 'reason'),
            thread: Utils.subAttribute(NS.MUC_USER, 'continue', 'thread'),
            'continue': Utils.boolSub(NS.MUC_USER, 'continue')
        }
    });

    let Decline = JXT.define({
        name: 'decline',
        namespace: NS.MUC_USER,
        element: 'decline',
        fields: {
            to: Utils.jidAttribute('to'),
            from: Utils.jidAttribute('from'),
            reason: Utils.textSub(NS.MUC_USER, 'reason')
        }
    });

    let AdminItem = JXT.define({
        name: '_mucAdminItem',
        namespace: NS.MUC_ADMIN,
        element: 'item',
        fields: {
            affiliation: Utils.attribute('affiliation'),
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid'),
            role: Utils.attribute('role'),
            reason: Utils.textSub(NS.MUC_ADMIN, 'reason')
        }
    });

    let AdminActor = JXT.define({
        name: 'actor',
        namespace: NS.MUC_USER,
        element: 'actor',
        fields: {
            nick: Utils.attribute('nick'),
            jid: Utils.jidAttribute('jid')
        }
    });

    let Destroy = JXT.define({
        name: 'destroy',
        namespace: NS.MUC_OWNER,
        element: 'destroy',
        fields: {
            jid: Utils.jidAttribute('jid'),
            password: Utils.textSub(NS.MUC_OWNER, 'password'),
            reason: Utils.textSub(NS.MUC_OWNER, 'reason')
        }
    });

    let MUC = JXT.define({
        name: 'muc',
        namespace: NS.MUC_USER,
        element: 'x',
        fields: {
            affiliation: proxy('_mucUserItem', 'affiliation'),
            nick: proxy('_mucUserItem', 'nick'),
            jid: proxy('_mucUserItem', 'jid'),
            role: proxy('_mucUserItem', 'role'),
            actor: proxy('_mucUserItem', '_mucUserActor'),
            reason: proxy('_mucUserItem', 'reason'),
            password: Utils.textSub(NS.MUC_USER, 'password'),
            codes: {
                get: function () {

                    return Utils.getMultiSubText(this.xml, NS.MUC_USER, 'status', function (sub) {

                        return Utils.getAttribute(sub, 'code');
                    });
                },
                set: function (value) {

                    let self = this;
                    Utils.setMultiSubText(this.xml, NS.MUC_USER, 'status', value, function (val) {

                        let child = Utils.createElement(NS.MUC_USER, 'status', NS.MUC_USER);
                        Utils.setAttribute(child, 'code', val);
                        self.xml.appendChild(child);
                    });
                }
            }
        }
    });

    let MUCAdmin = JXT.define({
        name: 'mucAdmin',
        namespace: NS.MUC_ADMIN,
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

    let MUCOwner = JXT.define({
        name: 'mucOwner',
        namespace: NS.MUC_OWNER,
        element: 'query'
    });

    let MUCJoin = JXT.define({
        name: 'joinMuc',
        namespace: NS.MUC,
        element: 'x',
        fields: {
            password: Utils.textSub(NS.MUC, 'password'),
            history: {
                get: function () {

                    let result = {};
                    let hist = Utils.find(this.xml, NS.MUC, 'history');

                    if (!hist.length) {
                        return {};
                    }
                    hist = hist[0];

                    let maxchars = hist.getAttribute('maxchars') || '';
                    let maxstanzas = hist.getAttribute('maxstanzas') || '';
                    let seconds = hist.getAttribute('seconds') || '';
                    let since = hist.getAttribute('since') || '';


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
                set: function (opts) {

                    let existing = Utils.find(this.xml, NS.MUC, 'history');
                    if (existing.length) {
                        for (let i = 0; i < existing.length; i++) {
                            this.xml.removeChild(existing[i]);
                        }
                    }

                    let hist = Utils.createElement(NS.MUC, 'history', NS.MUC);
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

    let DirectInvite = JXT.define({
        name: 'mucInvite',
        namespace: NS.MUC_DIRECT_INVITE,
        element: 'x',
        fields: {
            jid: Utils.jidAttribute('jid'),
            password: Utils.attribute('password'),
            reason: Utils.attribute('reason'),
            thread: Utils.attribute('thread'),
            'continue': Utils.boolAttribute('continue')
        }
    });


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

        JXT.add(IQ, 'mucUnique', Utils.textSub(NS.MUC_UNIQUE, 'unique'));
        JXT.extend(IQ, MUCAdmin);
        JXT.extend(IQ, MUCOwner);
    });

    JXT.withDataForm(function (DataForm) {

        JXT.extend(MUCOwner, DataForm);
    });
}
