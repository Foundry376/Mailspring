import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let CSIFeature = JXT.define({
        name: 'clientStateIndication',
        namespace: NS.CSI,
        element: 'csi'
    });

    JXT.define({
        name: 'csiActive',
        eventName: 'csi:active',
        namespace: NS.CSI,
        element: 'active',
        topLevel: true
    });

    JXT.define({
        name: 'csiInactive',
        eventName: 'csi:inactive',
        namespace: NS.CSI,
        element: 'inactive',
        topLevel: true
    });


    JXT.extendStreamFeatures(CSIFeature);
}
