import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let VCardTemp = JXT.define({
        name: 'vCardTemp',
        namespace: NS.VCARD_TEMP,
        element: 'vCard',
        fields: {
            role: Utils.textSub(NS.VCARD_TEMP, 'ROLE'),
            website: Utils.textSub(NS.VCARD_TEMP, 'URL'),
            title: Utils.textSub(NS.VCARD_TEMP, 'TITLE'),
            description: Utils.textSub(NS.VCARD_TEMP, 'DESC'),
            fullName: Utils.textSub(NS.VCARD_TEMP, 'FN'),
            birthday: Utils.dateSub(NS.VCARD_TEMP, 'BDAY'),
            nicknames: Utils.multiTextSub(NS.VCARD_TEMP, 'NICKNAME'),
            jids: Utils.multiTextSub(NS.VCARD_TEMP, 'JABBERID')
        }
    });

    let Email = JXT.define({
        name: '_email',
        namespace: NS.VCARD_TEMP,
        element: 'EMAIL',
        fields: {
            email: Utils.textSub(NS.VCARD_TEMP, 'USERID'),
            home: Utils.boolSub(NS.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(NS.VCARD_TEMP, 'WORK'),
            preferred: Utils.boolSub(NS.VCARD_TEMP, 'PREF')
        }
    });

    let PhoneNumber = JXT.define({
        name: '_tel',
        namespace: NS.VCARD_TEMP,
        element: 'TEL',
        fields: {
            number: Utils.textSub(NS.VCARD_TEMP, 'NUMBER'),
            home: Utils.boolSub(NS.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(NS.VCARD_TEMP, 'WORK'),
            mobile: Utils.boolSub(NS.VCARD_TEMP, 'CELL'),
            preferred: Utils.boolSub(NS.VCARD_TEMP, 'PREF')
        }
    });

    let Address = JXT.define({
        name: '_address',
        namespace: NS.VCARD_TEMP,
        element: 'ADR',
        fields: {
            street: Utils.textSub(NS.VCARD_TEMP, 'STREET'),
            street2: Utils.textSub(NS.VCARD_TEMP, 'EXTADD'),
            country: Utils.textSub(NS.VCARD_TEMP, 'CTRY'),
            city: Utils.textSub(NS.VCARD_TEMP, 'LOCALITY'),
            region: Utils.textSub(NS.VCARD_TEMP, 'REGION'),
            postalCode: Utils.textSub(NS.VCARD_TEMP, 'PCODE'),
            pobox: Utils.textSub(NS.VCARD_TEMP, 'POBOX'),
            home: Utils.boolSub(NS.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(NS.VCARD_TEMP, 'WORK'),
            preferred: Utils.boolSub(NS.VCARD_TEMP, 'PREF')
        }
    });

    let Organization = JXT.define({
        name: 'organization',
        namespace: NS.VCARD_TEMP,
        element: 'ORG',
        fields: {
            name: Utils.textSub(NS.VCARD_TEMP, 'ORGNAME'),
            unit: Utils.textSub(NS.VCARD_TEMP, 'ORGUNIT')
        }
    });

    let Name = JXT.define({
        name: 'name',
        namespace: NS.VCARD_TEMP,
        element: 'N',
        fields: {
            family: Utils.textSub(NS.VCARD_TEMP, 'FAMILY'),
            given: Utils.textSub(NS.VCARD_TEMP, 'GIVEN'),
            middle: Utils.textSub(NS.VCARD_TEMP, 'MIDDLE'),
            prefix: Utils.textSub(NS.VCARD_TEMP, 'PREFIX'),
            suffix: Utils.textSub(NS.VCARD_TEMP, 'SUFFIX')
        }
    });

    let Photo = JXT.define({
        name: 'photo',
        namespace: NS.VCARD_TEMP,
        element: 'PHOTO',
        fields: {
            type: Utils.textSub(NS.VCARD_TEMP, 'TYPE'),
            data: Utils.textSub(NS.VCARD_TEMP, 'BINVAL'),
            url: Utils.textSub(NS.VCARD_TEMP, 'EXTVAL')
        }
    });


    JXT.extend(VCardTemp, Email, 'emails');
    JXT.extend(VCardTemp, Address, 'addresses');
    JXT.extend(VCardTemp, PhoneNumber, 'phoneNumbers');
    JXT.extend(VCardTemp, Organization);
    JXT.extend(VCardTemp, Name);
    JXT.extend(VCardTemp, Photo);

    JXT.extendIQ(VCardTemp);
}
