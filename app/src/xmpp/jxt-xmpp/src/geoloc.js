import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let GeoLoc = JXT.define({
        name: 'geoloc',
        namespace: NS.GEOLOC,
        element: 'geoloc',
        fields: {
            accuracy: Utils.numberSub(NS.GEOLOC, 'accuracy', true),
            altitude: Utils.numberSub(NS.GEOLOC, 'alt', true),
            area: Utils.textSub(NS.GEOLOC, 'area'),
            heading: Utils.numberSub(NS.GEOLOC, 'bearing', true),
            bearing: Utils.numberSub(NS.GEOLOC, 'bearing', true),
            building: Utils.textSub(NS.GEOLOC, 'building'),
            country: Utils.textSub(NS.GEOLOC, 'country'),
            countrycode: Utils.textSub(NS.GEOLOC, 'countrycode'),
            datum: Utils.textSub(NS.GEOLOC, 'datum'),
            description: Utils.textSub(NS.GEOLOC, 'description'),
            error: Utils.numberSub(NS.GEOLOC, 'error', true),
            floor: Utils.textSub(NS.GEOLOC, 'floor'),
            latitude: Utils.numberSub(NS.GEOLOC, 'lat', true),
            locality: Utils.textSub(NS.GEOLOC, 'locality'),
            longitude: Utils.numberSub(NS.GEOLOC, 'lon', true),
            postalcode: Utils.textSub(NS.GEOLOC, 'postalcode'),
            region: Utils.textSub(NS.GEOLOC, 'region'),
            room: Utils.textSub(NS.GEOLOC, 'room'),
            speed: Utils.numberSub(NS.GEOLOC, 'speed', true),
            street: Utils.textSub(NS.GEOLOC, 'street'),
            text: Utils.textSub(NS.GEOLOC, 'text'),
            timestamp: Utils.dateSub(NS.GEOLOC, 'timestamp'),
            tzo: Utils.tzoSub(NS.GEOLOC, 'tzo'),
            uri: Utils.textSub(NS.GEOLOC, 'uri')
        }
    });

    JXT.extendPubsubItem(GeoLoc);
}
