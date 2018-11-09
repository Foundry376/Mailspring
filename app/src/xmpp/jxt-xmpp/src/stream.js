import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    JXT.define({
        name: 'stream',
        namespace: NS.STREAM,
        element: 'stream',
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            version: Utils.attribute('version', '1.0'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true)
        }
    });
}
