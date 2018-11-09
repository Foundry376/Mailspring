'use strict';

var OldWSConnection = require('../transports/old-websocket');


module.exports = function (client) {

    client.transports['old-websocket'] = OldWSConnection;
};
