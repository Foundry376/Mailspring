import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Services = exports.Services = JXT.define({
        name: 'services',
        namespace: NS.DISCO_EXTERNAL_1,
        element: 'services',
        fields: {
            type: Utils.attribute('type')
        }
    });

    let Credentials = exports.Credentials = JXT.define({
        name: 'credentials',
        namespace: NS.DISCO_EXTERNAL_1,
        element: 'credentials'
    });

    let Service = JXT.define({
        name: 'service',
        namespace: NS.DISCO_EXTERNAL_1,
        element: 'service',
        fields: {
            host: Utils.attribute('host'),
            port: Utils.attribute('port'),
            transport: Utils.attribute('transport'),
            type: Utils.attribute('type'),
            username: Utils.attribute('username'),
            password: Utils.attribute('password')
        }
    });


    JXT.extend(Services, Service, 'services');
    JXT.extend(Credentials, Service);

    JXT.extendIQ(Services);
    JXT.extendIQ(Credentials);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Service, DataForm);
    });
}
