'use strict';

var BOSHConnection = require('../transports/bosh');


module.exports = function (client) {

    client.transports.bosh = BOSHConnection;
};
