'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Security = JXT.define({
        name: 'securityLabel',
        namespace: _xmppConstants.Namespace.SEC_LABEL_0,
        element: 'securitylabel',
        fields: {
            display: Utils.textSub(_xmppConstants.Namespace.SEC_LABEL_0, 'displaymarking'),
            color: Utils.subAttribute(_xmppConstants.Namespace.SEC_LABEL_0, 'displaymarking', 'fgcolor'),
            background: Utils.subAttribute(_xmppConstants.Namespace.SEC_LABEL_0, 'displaymarking', 'bgcolor')
        }
    });

    var Label = JXT.define({
        name: 'label',
        namespace: _xmppConstants.Namespace.SEC_LABEL_0,
        element: 'label',
        fields: {
            text: Utils.text(),
            ess: Utils.textSub(_xmppConstants.Namespace.SEC_LABEL_ESS_0, 'esssecuritylabel')
        }
    });

    var EquivalentLabel = JXT.define({
        name: '_equivalentLabel',
        namespace: _xmppConstants.Namespace.SEC_LABEL_0,
        element: 'equivalentlabel',
        fields: {
            text: Utils.text(),
            ess: Utils.textSub(_xmppConstants.Namespace.SEC_LABEL_ESS_0, 'esssecuritylabel')
        }
    });

    var Catalog = JXT.define({
        name: 'securityLabelCatalog',
        namespace: _xmppConstants.Namespace.SEC_LABEL_CATALOG_2,
        element: 'catalog',
        fields: {
            to: Utils.jidAttribute('to'),
            from: Utils.jidAttribute('from'),
            name: Utils.attribute('name'),
            description: Utils.attribute('desc'),
            id: Utils.attribute('id'),
            size: Utils.numberAttribute('size'),
            restrict: Utils.boolAttribute('restrict')
        }
    });

    var CatalogItem = JXT.define({
        name: '_securityLabelCatalogItem',
        namespace: _xmppConstants.Namespace.SEC_LABEL_CATALOG_2,
        element: 'item',
        fields: {
            selector: Utils.attribute('selector'),
            'default': Utils.boolAttribute('default')
        }
    });

    JXT.extend(Security, Label);
    JXT.extend(Security, EquivalentLabel, 'equivalentLabels');
    JXT.extend(CatalogItem, Security);
    JXT.extend(Catalog, CatalogItem, 'items');

    JXT.extendMessage(Security);
    JXT.extendIQ(Catalog);
};

module.exports = exports['default'];
//# sourceMappingURL=seclabels.js.map