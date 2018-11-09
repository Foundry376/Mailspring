'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var VCardTemp = JXT.define({
        name: 'vCardTemp',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'vCard',
        fields: {
            role: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'ROLE'),
            website: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'URL'),
            title: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'TITLE'),
            description: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'DESC'),
            fullName: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'FN'),
            birthday: Utils.dateSub(_xmppConstants.Namespace.VCARD_TEMP, 'BDAY'),
            nicknames: Utils.multiTextSub(_xmppConstants.Namespace.VCARD_TEMP, 'NICKNAME'),
            jids: Utils.multiTextSub(_xmppConstants.Namespace.VCARD_TEMP, 'JABBERID')
        }
    });

    var Email = JXT.define({
        name: '_email',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'EMAIL',
        fields: {
            email: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'USERID'),
            home: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'WORK'),
            preferred: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'PREF')
        }
    });

    var PhoneNumber = JXT.define({
        name: '_tel',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'TEL',
        fields: {
            number: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'NUMBER'),
            home: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'WORK'),
            mobile: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'CELL'),
            preferred: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'PREF')
        }
    });

    var Address = JXT.define({
        name: '_address',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'ADR',
        fields: {
            street: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'STREET'),
            street2: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'EXTADD'),
            country: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'CTRY'),
            city: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'LOCALITY'),
            region: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'REGION'),
            postalCode: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'PCODE'),
            pobox: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'POBOX'),
            home: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'HOME'),
            work: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'WORK'),
            preferred: Utils.boolSub(_xmppConstants.Namespace.VCARD_TEMP, 'PREF')
        }
    });

    var Organization = JXT.define({
        name: 'organization',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'ORG',
        fields: {
            name: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'ORGNAME'),
            unit: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'ORGUNIT')
        }
    });

    var Name = JXT.define({
        name: 'name',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'N',
        fields: {
            family: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'FAMILY'),
            given: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'GIVEN'),
            middle: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'MIDDLE'),
            prefix: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'PREFIX'),
            suffix: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'SUFFIX')
        }
    });

    var Photo = JXT.define({
        name: 'photo',
        namespace: _xmppConstants.Namespace.VCARD_TEMP,
        element: 'PHOTO',
        fields: {
            type: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'TYPE'),
            data: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'BINVAL'),
            url: Utils.textSub(_xmppConstants.Namespace.VCARD_TEMP, 'EXTVAL')
        }
    });

    JXT.extend(VCardTemp, Email, 'emails');
    JXT.extend(VCardTemp, Address, 'addresses');
    JXT.extend(VCardTemp, PhoneNumber, 'phoneNumbers');
    JXT.extend(VCardTemp, Organization);
    JXT.extend(VCardTemp, Name);
    JXT.extend(VCardTemp, Photo);

    JXT.extendIQ(VCardTemp);
};

module.exports = exports['default'];
//# sourceMappingURL=vcard.js.map