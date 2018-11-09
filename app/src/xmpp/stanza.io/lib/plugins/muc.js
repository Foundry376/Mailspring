'use strict';

var each = require('lodash.foreach');
var JID = require('xmpp-jid').JID;


module.exports = function (client) {

    client.disco.addFeature('http://jabber.org/protocol/muc');
    client.disco.addFeature('jabber:x:conference');
    client.disco.addFeature('urn:xmpp:hats:0');

    client.joinedRooms = {};
    client.joiningRooms = {};

    function rejoinRooms() {
        each(client.joiningRooms, function (nick, room) {
            delete client.joiningRooms[room];
            client.joinRoom(room, nick);
        });
        each(client.joinedRooms, function (nick, room) {
            delete client.joinedRooms[room];
            client.joinRoom(room, nick);
        });
    }
    client.on('session:started', rejoinRooms);
    client.on('stream:management:resumed', rejoinRooms);

    client.on('message', function (msg) {
        if (msg.muc) {
            if (msg.muc.invite) {
                client.emit('muc:invite', {
                    from: msg.muc.invite.from,
                    room: msg.from,
                    reason: msg.muc.invite.reason,
                    password: msg.muc.password,
                    thread: msg.muc.invite.thread,
                    type: 'mediated'
                });
            }
            if (msg.muc.decline) {
                client.emit('muc:declined', {
                    room: msg.from,
                    from: msg.muc.decline.from,
                    reason: msg.muc.decline.reason
                });
            }
        } else if (msg.mucInvite) {
            client.emit('muc:invite', {
                from: msg.from,
                room: msg.mucInvite.jid,
                reason: msg.mucInvite.reason,
                password: msg.mucInvite.password,
                thread: msg.mucInvite.thread,
                type: 'direct'
            });
        }

        if (msg.type === 'groupchat' && msg.subject) {
            client.emit('muc:subject', msg);
        }
    });

    client.on('presence', function (pres) {
        if (client.joiningRooms[pres.from.bare] && pres.type === 'error') {
            delete client.joiningRooms[pres.from.bare];
            client.emit('muc:failed', pres);
            client.emit('muc:error', pres);
        } else if (pres.muc) {
            var isSelf = pres.muc.codes && pres.muc.codes.indexOf('110') >= 0;
            if (pres.type === 'error') {
                client.emit('muc:error', pres);
            } else if (pres.type === 'unavailable') {
                client.emit('muc:unavailable', pres);
                if (isSelf) {
                    client.emit('muc:leave', pres);
                    delete client.joinedRooms[pres.from.bare];
                }
                if (pres.muc.destroyed) {
                    client.emit('muc:destroyed', {
                        room: pres.from,
                        newRoom: pres.muc.destroyed.jid,
                        reason: pres.muc.destroyed.reason,
                        password: pres.muc.destroyed.password
                    });
                }
            } else {
                client.emit('muc:available', pres);
                if (isSelf && !client.joinedRooms[pres.from.bare]) {
                    client.emit('muc:join', pres);
                    delete client.joiningRooms[pres.from.bare];
                    client.joinedRooms[pres.from.bare] = pres.from.resource;
                }
            }
        }
    });

    client.joinRoom = function (room, nick, opts) {
        opts = opts || {};
        opts.to = room + '/' + nick;
        opts.caps = this.disco.caps;
        opts.joinMuc = opts.joinMuc || {};

        this.joiningRooms[room] = nick;

        this.sendPresence(opts);
    };

    // client.leaveRoom = function (room, nick, opts) {
    //     opts = opts || {};
    //     opts.to = room + '/' + nick;
    //     opts.type = 'unavailable';
    //     this.sendPresence(opts);
    // };

    client.ban = function (room, jid, reason, cb) {
        client.setRoomAffiliation(room, jid, 'outcast', reason, cb);
    };

    client.kick = function (room, nick, reason, cb) {
        client.setRoomRole(room, nick, 'none', reason, cb);
    };

    client.invite = function (room, opts) {
        client.sendMessage({
            to: room,
            muc: {
                invites: opts
            }
        });
    };

    client.directInvite = function (room, opts) {
        opts.jid = room;
        client.sendMessage({
            to: opts.to,
            mucInvite: opts
        });
    };

    client.declineInvite = function (room, sender, reason) {
        client.sendMessage({
            to: room,
            muc: {
                decline: {
                    to: sender,
                    reason: reason
                }
            }
        });
    };

    client.changeNick = function (room, nick) {
        client.sendPresence({
            to: (new JID(room)).bare + '/' + nick
        });
    };

    client.setSubject = function (room, subject) {
        client.sendMessage({
            to: room,
            type: 'groupchat',
            subject: subject
        });
    };

    client.discoverReservedNick = function (room, cb) {
        client.getDiscoInfo(room, 'x-roomuser-item', function (err, res) {
            if (err) {
                return cb(err);
            }
            var ident = res.discoInfo.identities[0] || {};
            cb(null, ident.name);
        });
    };

    client.requestRoomVoice = function (room) {
        client.sendMessage({
            to: room,
            form: {
                fields: [
                    {
                        name: 'FORM_TYPE',
                        value: 'http://jabber.org/protocol/muc#request'
                    },
                    {
                        name: 'muc#role',
                        type: 'text-single',
                        value: 'participant'
                    }
                ]
            }
        });
    };

    client.setRoomAffiliation = function (room, jid, affiliation, reason, cb) {
        return this.sendIq({
            type: 'set',
            to: room,
            mucAdmin: {
                jid: jid,
                affiliation: affiliation,
                reason: reason
            }
        }, cb);
    };

    client.setRoomRole = function (room, nick, role, reason, cb) {
        return this.sendIq({
            type: 'set',
            to: room,
            mucAdmin: {
                nick: nick,
                role: role,
                reason: reason
            }
        }, cb);
    };

    client.setNickName=function (room,name,cb){
        return this.sendIq({
            type: 'set',
            to: room,
            edimucprofile: {
                nickname: name
            }
        }, cb);
    };

    client.setRoomName=function (room,opts,cb){
        return this.sendIq({
            type: 'set',
            to: room,
            edimucconfig: opts
        }, cb);
    };

    client.getRoomMembers = function (room, opts, cb) {
        return this.sendIq({
            type: 'get',
            to: room,
            mucAdmin: opts
        }, cb);
    };
    client.getRoomList=function(ver,cb){//yazz ok
        return this.sendIq({
            type: 'get',
            to: 'muc.im.edison.tech',
            ediQuery:{
                xmlns:'http://jabber.org/protocol/disco#items',
                ver:ver
            }
        }, cb);
    };

    client.addMember=function(room,jid,cb){
        client.setRoomAffiliation(room,jid,'member','',cb);
    }
    client.leaveRoom=function(room,jid,cb){
        client.setRoomAffiliation(room,jid,'none','',cb);
    }

    client.createRoom=function(room,opts,cb){
        return this.sendIq({
            type: 'set',
            to: room,
            edimuc: {
                type:opts.type,
                name:opts.name,
                subject:opts.subject,
                description:opts.description,
                _mucMembers:opts.members
            }
        }, cb);
    }

    client.getRoomConfig = function (jid, cb) {
        return this.sendIq({
            to: jid,
            type: 'get',
            mucOwner: true
        }, cb);
    };

    client.configureRoom = function (jid, form, cb) {
        if (!form.type) {
            form.type = 'submit';
        }
        return this.sendIq({
            to: jid,
            type: 'set',
            mucOwner: {
                form: form
            }
        }, cb);
    };

    client.destroyRoom = function (jid, opts, cb) {
        return this.sendIq({
            to: jid,
            type: 'set',
            mucOwner: {
                destroy: opts
            }
        }, cb);
    };

    client.getUniqueRoomName = function (jid, cb) {
        return this.sendIq({
            type: 'get',
            to: jid,
            mucUnique: true
        }, cb);
    };
};
