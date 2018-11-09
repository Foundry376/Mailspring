/* global Promise */
'use strict';

function timeoutPromise(targetPromise, delay) {
    var timeoutRef;
    return Promise.race([
        targetPromise,
        new Promise(function (resolve, reject) {
            timeoutRef = setTimeout(function () {
                reject();
            }, delay);
        })
    ]).then(function (result) {
        clearTimeout(timeoutRef);
        return result;
    });
}


function checkConnection(client, timeout) {
    return timeoutPromise(new Promise(function (resolve, reject) {
        if (client.sm.started) {
            client.once('stream:management:ack', resolve);
            client.sm.request();
        } else {
            client.ping().then(resolve).catch(function (err) {
                if (err.error && err.error.condition !== 'timeout') {
                    resolve();
                } else {
                    reject();
                }
            });
        }
    }), (timeout * 1000) || 15000);
}


module.exports = function (client) {
    client.enableKeepAlive = function (opts) {
        opts = opts || {};

        // Ping every 5 minutes
        opts.interval = opts.interval || 300;

        // Disconnect if no response in 15 seconds
        opts.timeout = opts.timeout || 15;

        function keepalive() {
            if (client.sessionStarted) {
                checkConnection(client, opts.timeout).catch(function () {
                    // Kill the apparently dead connection without closing
                    // the stream itself so we can reconnect and potentially
                    // resume the session.
                    client.emit('stream:error', {
                        condition: 'connection-timeout',
                        text: 'Server did not respond in ' + opts.timeout + ' seconds'
                    });
                    if (client.transport) {
                        client.transport.hasStream = false;
                        client.transport.disconnect();
                    }
                });
            }
        }

        client._keepAliveInterval = setInterval(keepalive, opts.interval * 1000);
    };

    client.disableKeepAlive = function () {
        if (client._keepAliveInterval) {
            clearInterval(client._keepAliveInterval);
            delete client._keepAliveInterval;
        }
    };

    client.on('disconnected', function () {
        client.disableKeepAlive();
    });
};
