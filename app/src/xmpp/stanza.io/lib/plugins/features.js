'use strict';

var async = require('async');


module.exports = function (client) {

    client.features = {
        negotiated: {},
        order: [],
        handlers: {}
    };

    client.registerFeature = function (name, priority, handler) {
        this.features.order.push({
            priority: priority,
            name: name
        });
        this.features.order.sort(function (a, b) {
            if (a.priority < b.priority) {
                return -1;
            }
            if (a.priority > b.priority) {
                return 1;
            }
            return 0;
        });
        this.features.handlers[name] = handler.bind(client);
    };

    client.on('streamFeatures', function (features) {
        var series = [];
        var negotiated = client.features.negotiated;
        var handlers = client.features.handlers;

        client.features.order.forEach(function (feature) {
            var name = feature.name;
            if (features[name] && handlers[name] && !negotiated[name]) {
                series.push(function (cb) {
                    if (!negotiated[name]) {
                        handlers[name](features, cb);
                    } else {
                        cb();
                    }
                });
            }
        });

        async.series(series, function (cmd, msg) {
            if (cmd === 'restart') {
                client.transport.restart();
            } else if (cmd === 'disconnect') {
                client.emit('stream:error', {
                    condition: 'policy-violation',
                    text: 'Failed to negotiate stream features: ' + msg
                });
                client.disconnect();
            }
        });
    });
    client.on('streamFeaturesEx', function (name) {// yazz
        var series = [];
        var negotiated = client.features.negotiated;
        var handlers = client.features.handlers;
    
        client.features.order.forEach(function (feature) {
            //var name = feature.name;
            if (feature.name==name && handlers[name] && !negotiated[name]) {
                series.push(function (cb) {
                    if (!negotiated[name]) {
                        handlers[name](features, cb);
                    } else {
                        cb();
                    }
                });
            }
        });
        async.series(series, function (cmd, msg) {
            if (cmd === 'restart') {
                client.transport.restart();
            } else if (cmd === 'disconnect') {
                client.emit('stream:error', {
                    condition: 'policy-violation',
                    text: 'Failed to negotiate stream features: ' + msg
                });
                client.disconnect();
            }
        });
    });
};