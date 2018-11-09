import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let SMFeature = JXT.define({
        name: 'streamManagement',
        namespace: NS.SMACKS_3,
        element: 'sm'
    });

    JXT.define({
        name: 'smEnable',
        eventName: 'stream:management:enable',
        namespace: NS.SMACKS_3,
        element: 'enable',
        topLevel: true,
        fields: {
            resume: Utils.boolAttribute('resume')
        }
    });

    JXT.define({
        name: 'smEnabled',
        eventName: 'stream:management:enabled',
        namespace: NS.SMACKS_3,
        element: 'enabled',
        topLevel: true,
        fields: {
            id: Utils.attribute('id'),
            resume: Utils.boolAttribute('resume')
        }
    });

    JXT.define({
        name: 'smResume',
        eventName: 'stream:management:resume',
        namespace: NS.SMACKS_3,
        element: 'resume',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0),
            previd: Utils.attribute('previd')
        }
    });

    JXT.define({
        name: 'smResumed',
        eventName: 'stream:management:resumed',
        namespace: NS.SMACKS_3,
        element: 'resumed',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0),
            previd: Utils.attribute('previd')
        }
    });

    JXT.define({
        name: 'smFailed',
        eventName: 'stream:management:failed',
        namespace: NS.SMACKS_3,
        element: 'failed',
        topLevel: true
    });

    JXT.define({
        name: 'smAck',
        eventName: 'stream:management:ack',
        namespace: NS.SMACKS_3,
        element: 'a',
        topLevel: true,
        fields: {
            h: Utils.numberAttribute('h', false, 0)
        }
    });

    JXT.define({
        name: 'smRequest',
        eventName: 'stream:management:request',
        namespace: NS.SMACKS_3,
        element: 'r',
        topLevel: true
    });


    JXT.extendStreamFeatures(SMFeature);
}
