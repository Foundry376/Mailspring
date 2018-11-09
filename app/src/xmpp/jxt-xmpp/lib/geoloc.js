'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var GeoLoc = JXT.define({
        name: 'geoloc',
        namespace: _xmppConstants.Namespace.GEOLOC,
        element: 'geoloc',
        fields: {
            accuracy: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'accuracy', true),
            altitude: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'alt', true),
            area: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'area'),
            heading: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'bearing', true),
            bearing: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'bearing', true),
            building: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'building'),
            country: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'country'),
            countrycode: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'countrycode'),
            datum: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'datum'),
            description: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'description'),
            error: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'error', true),
            floor: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'floor'),
            latitude: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'lat', true),
            locality: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'locality'),
            longitude: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'lon', true),
            postalcode: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'postalcode'),
            region: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'region'),
            room: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'room'),
            speed: Utils.numberSub(_xmppConstants.Namespace.GEOLOC, 'speed', true),
            street: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'street'),
            text: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'text'),
            timestamp: Utils.dateSub(_xmppConstants.Namespace.GEOLOC, 'timestamp'),
            tzo: Utils.tzoSub(_xmppConstants.Namespace.GEOLOC, 'tzo'),
            uri: Utils.textSub(_xmppConstants.Namespace.GEOLOC, 'uri')
        }
    });

    JXT.extendPubsubItem(GeoLoc);
};

module.exports = exports['default'];
//# sourceMappingURL=geoloc.js.map