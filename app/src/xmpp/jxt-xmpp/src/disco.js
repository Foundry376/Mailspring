import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;


    let DiscoCaps = JXT.define({
        name: 'caps',
        namespace: NS.CAPS,
        element: 'c',
        fields: {
            ver: Utils.attribute('ver'),
            node: Utils.attribute('node'),
            hash: Utils.attribute('hash'),
            ext: Utils.attribute('ext')
        }
    });

    let DiscoInfo = JXT.define({
        name: 'discoInfo',
        namespace: NS.DISCO_INFO,
        element: 'query',
        fields: {
            node: Utils.attribute('node'),
            features: Utils.multiSubAttribute(NS.DISCO_INFO, 'feature', 'var')
        }
    });

    let DiscoIdentity = JXT.define({
        name: '_discoIdentity',
        namespace: NS.DISCO_INFO,
        element: 'identity',
        fields: {
            category: Utils.attribute('category'),
            type: Utils.attribute('type'),
            name: Utils.attribute('name'),
            lang: Utils.langAttribute()
        }
    });

    let DiscoItems = JXT.define({
        name: 'discoItems',
        namespace: NS.DISCO_ITEMS,
        element: 'query',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let DiscoItem = JXT.define({
        name: '_discoItem',
        namespace: NS.DISCO_ITEMS,
        element: 'item',
        fields: {
            jid: Utils.jidAttribute('jid'),
            node: Utils.attribute('node'),
            name: Utils.attribute('name')
        }
    });


    JXT.extend(DiscoItems, DiscoItem, 'items');
    JXT.extend(DiscoInfo, DiscoIdentity, 'identities');

    JXT.extendIQ(DiscoInfo);
    JXT.extendIQ(DiscoItems);
    JXT.extendPresence(DiscoCaps);
    JXT.extendStreamFeatures(DiscoCaps);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(DiscoInfo, DataForm, 'extensions');
    });

    JXT.withDefinition('set', NS.RSM, function (RSM) {

        JXT.extend(DiscoItems, RSM);
    });
}
