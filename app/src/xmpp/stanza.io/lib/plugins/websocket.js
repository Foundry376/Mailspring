'use strict';

var WSConnection = require('../transports/websocket');


module.exports = function (client) {

    client.transports.websocket = WSConnection;
};
