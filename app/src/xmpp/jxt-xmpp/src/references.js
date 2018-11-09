import { Namespace as NS } from 'xmpp-constants';

export default function (JXT) {

    let Utils = JXT.utils;

    let Reference = JXT.define({
        name: 'reference',
        element: 'reference',
        namespace: NS.REFERENCE_0,
        fields: {
            type: Utils.attribute('type'),
            begin: Utils.numberAttribute('begin'),
            end: Utils.numberAttribute('end'),
            uri: Utils.attribute('uri'),
            anchor: Utils.attribute('anchor')
        }
    });

    let References = Utils.multiExtension(Reference);

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'references', References);
    });
}
