'use strict';



module.exports = function (client) {

    client.goInvisible = function (cb) {
        return this.sendIq({
            type: 'set',
            invisible: true
        }, cb);
    };

    client.goVisible = function (cb) {
        return this.sendIq({
            type: 'set',
            visible: true
        }, cb);
    };
};
