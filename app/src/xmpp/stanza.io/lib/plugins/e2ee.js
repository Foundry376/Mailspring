'use strict';


module.exports = function (client) {
    client.getE2ee = function (users,cb) {
        var self = this;
        let obj={
            type: 'get',
            e2ee:{text:''}
        };
        if(users){
            for(let jid in users){
                obj.e2ee.jidSub=jid;
            }
        }
        return client.sendIq(obj).then(function (resp) {
            // if (resp.e2ee) {
            //     var ver = resp.roster.ver;
            //     if (ver) {
            //         self.config.rosterVer = ver;
            //         self.emit('roster:ver', ver);
            //     }
            // }
            //debugger;
            return resp;
        }).then(function (result) {
            if (cb) {
                cb(null, result);
            }
            //debugger;
            return result;
        }, function (err) {
            if (cb) {
                cb(err);
            } else {
                throw err;
            }
        });
    };
    client.setE2ee = function (user, cb) {
        return client.sendIq({
            type: 'set',
            e2ee: {users:user}
        }, cb);
    };
};