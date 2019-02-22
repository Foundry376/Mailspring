'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {
    var helpers = JXT.utils;

    var IQEx = JXT.define({
        name: 'iq',
        element: 'iq',
        topLevel: true,
        fields: {
            lang: helpers.langAttribute(),
            id: helpers.attribute('id'),
            to: helpers.attribute('to'),
            from: helpers.attribute('from'),
            type: helpers.attribute('type')
        }
    });
    var EdiPull = JXT.define({
        name: 'edipull',
        element: 'edipull',
        namespace: 'edipull',
        fields: {
            type: helpers.attribute('type'),
            param: {
                get: function getParam() {
                    return helpers.getSubLangText(this.xml, '', 'param', '');
                },
                set: function setParam(value) {
                    helpers.setSubLangText(this.xml, '', 'param', '', this.lang);
                    helpers.setAttribute(this.xml.children[0], 'since', value['since']);
                    helpers.setAttribute(this.xml.children[0], 'pagenumber', value['pagenumber']);
                    if (value['incrooms']) {
                        helpers.setAttribute(this.xml.children[0], 'incrooms', value['incrooms']);
                    }
                }
            }
        }
    });

    JXT.extend(IQEx, EdiPull);
}

module.exports = exports['default'];