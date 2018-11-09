'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var DiscoCaps = JXT.define({
        name: 'caps',
        namespace: _xmppConstants.Namespace.CAPS,
        element: 'c',
        fields: {
            ver: Utils.attribute('ver'),
            node: Utils.attribute('node'),
            hash: Utils.attribute('hash'),
            ext: Utils.attribute('ext')
        }
    });

    var DiscoInfo = JXT.define({
        name: 'discoInfo',
        namespace: _xmppConstants.Namespace.DISCO_INFO,
        element: 'query',
        fields: {
            node: Utils.attribute('node'),
            features: Utils.multiSubAttribute(_xmppConstants.Namespace.DISCO_INFO, 'feature', 'var')
        }
    });

    var DiscoIdentity = JXT.define({
        name: '_discoIdentity',
        namespace: _xmppConstants.Namespace.DISCO_INFO,
        element: 'identity',
        fields: {
            category: Utils.attribute('category'),
            type: Utils.attribute('type'),
            name: Utils.attribute('name'),
            lang: Utils.langAttribute()
        }
    });

    var DiscoItems = JXT.define({
        name: 'discoItems',
        namespace: _xmppConstants.Namespace.DISCO_ITEMS,
        element: 'query',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var DiscoItem = JXT.define({
        name: '_discoItem',
        namespace: _xmppConstants.Namespace.DISCO_ITEMS,
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

    JXT.withDefinition('set', _xmppConstants.Namespace.RSM, function (RSM) {

        JXT.extend(DiscoItems, RSM);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=disco.js.map