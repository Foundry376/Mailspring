'use strict';

module.exports = function (client) {
    client.pullMessage = function (ts, cb) {
        if (!ts) {
            ts = new Date().getTime();
        }
        let pull = new IQEx();
        pull.type = 'get';
        pull.edipull.type = 'message';
        pull.edipull.param = {
            since: ts,
            pagenumber: 100,
            incrooms: true
        };
        client.sendIq(pull, function (err, result) {
            if (cb) {
                cb(err, result);
            }
        });
    }
};
