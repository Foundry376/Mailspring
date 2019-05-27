'use strict';

var jxt = require('jxt').createRegistry();
var helpers = jxt.utils;
module.exports = function (client) {
    var IQEx = jxt.define({
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
    var EdiPull = jxt.define({
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

    jxt.extend(IQEx, EdiPull);
    client.pullMessage = function (ts, cb) {
        if (!ts) {
            ts = new Date().getTime();
        }
        let pull = new IQEx();
        pull.type = 'get';
        pull.edipull.type = 'message';
        pull.edipull.param = {
            since: ts,
            pagenumber: 20,
            incrooms: true
        };
        client.sendIq(pull, cb);
    }
};
