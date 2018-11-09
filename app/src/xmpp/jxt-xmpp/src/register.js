import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Register = JXT.define({
        name: 'register',
        namespace: NS.REGISTER,
        element: 'query',
        fields: {
            instructions: Utils.textSub(NS.REGISTER, 'instructions'),
            registered: Utils.boolSub(NS.REGISTER, 'registered'),
            remove: Utils.boolSub(NS.REGISTER, 'remove'),
            username: Utils.textSub(NS.REGISTER, 'username'),
            nick: Utils.textSub(NS.REGISTER, 'nick'),
            password: Utils.textSub(NS.REGISTER, 'password'),
            name: Utils.textSub(NS.REGISTER, 'name'),
            first: Utils.textSub(NS.REGISTER, 'first'),
            last: Utils.textSub(NS.REGISTER, 'last'),
            email: Utils.textSub(NS.REGISTER, 'email'),
            address: Utils.textSub(NS.REGISTER, 'address'),
            city: Utils.textSub(NS.REGISTER, 'city'),
            state: Utils.textSub(NS.REGISTER, 'state'),
            zip: Utils.textSub(NS.REGISTER, 'zip'),
            phone: Utils.textSub(NS.REGISTER, 'phone'),
            url: Utils.textSub(NS.REGISTER, 'url'),
            date: Utils.textSub(NS.REGISTER, 'date'),
            misc: Utils.textSub(NS.REGISTER, 'misc'),
            text: Utils.textSub(NS.REGISTER, 'text'),
            key: Utils.textSub(NS.REGISTER, 'key')
        }
    });

    JXT.extendIQ(Register);

    JXT.withDefinition('x', NS.OOB, function (OOB) {

        JXT.extend(Register, OOB);
    });

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Register, DataForm);
    });
}
