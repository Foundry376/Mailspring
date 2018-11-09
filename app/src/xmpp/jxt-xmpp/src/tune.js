import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Tune = JXT.define({
        name: 'tune',
        namespace: NS.TUNE,
        element: 'tune',
        fields: {
            artist: Utils.textSub(NS.TUNE, 'artist'),
            length: Utils.numberSub(NS.TUNE, 'length'),
            rating: Utils.numberSub(NS.TUNE, 'rating'),
            source: Utils.textSub(NS.TUNE, 'source'),
            title: Utils.textSub(NS.TUNE, 'title'),
            track: Utils.textSub(NS.TUNE, 'track'),
            uri: Utils.textSub(NS.TUNE, 'uri')
        }
    });


    JXT.extendPubsubItem(Tune);
    JXT.extendMessage(Tune);
}
