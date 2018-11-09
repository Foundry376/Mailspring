'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _xmppJid = require('xmpp-jid');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var MAMQuery = JXT.define({
        name: 'mam',
        namespace: _xmppConstants.Namespace.MAM_2,
        element: 'query',
        fields: {
            queryid: Utils.attribute('queryid'),
            node: Utils.attribute('node')
        }
    });

    var Result = JXT.define({
        name: 'mamItem',
        namespace: _xmppConstants.Namespace.MAM_2,
        element: 'result',
        fields: {
            queryid: Utils.attribute('queryid'),
            id: Utils.attribute('id')
        }
    });

    var Fin = JXT.define({
        name: 'mamResult',
        namespace: _xmppConstants.Namespace.MAM_2,
        element: 'fin',
        fields: {
            complete: Utils.boolAttribute('complete'),
            stable: Utils.boolAttribute('stable')
        }
    });

    var Prefs = JXT.define({
        name: 'mamPrefs',
        namespace: _xmppConstants.Namespace.MAM_2,
        element: 'prefs',
        fields: {
            defaultCondition: Utils.attribute('default'),
            always: {
                get: function get() {

                    var results = [];
                    var container = Utils.find(this.xml, _xmppConstants.Namespace.MAM_2, 'always');
                    if (container.length === 0) {
                        return results;
                    }
                    container = container[0];
                    var jids = Utils.getMultiSubText(container, _xmppConstants.Namespace.MAM_2, 'jid');
                    jids.forEach(function (jid) {

                        results.push(new _xmppJid.JID(jid.textContent));
                    });
                    return results;
                },
                set: function set(value) {

                    if (value.length > 0) {
                        var container = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.MAM_2, 'always');
                        Utils.setMultiSubText(container, _xmppConstants.Namespace.MAM_2, 'jid', value);
                    }
                }
            },
            never: {
                get: function get() {

                    var results = [];
                    var container = Utils.find(this.xml, _xmppConstants.Namespace.MAM_2, 'always');
                    if (container.length === 0) {
                        return results;
                    }
                    container = container[0];
                    var jids = Utils.getMultiSubText(container, _xmppConstants.Namespace.MAM_2, 'jid');
                    jids.forEach(function (jid) {

                        results.push(new _xmppJid.JID(jid.textContent));
                    });
                    return results;
                },
                set: function set(value) {

                    if (value.length > 0) {
                        var container = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.MAM_2, 'never');
                        Utils.setMultiSubText(container, _xmppConstants.Namespace.MAM_2, 'jid', value);
                    }
                }
            }
        }
    });

    JXT.extendMessage(Result);

    JXT.extendIQ(MAMQuery);
    JXT.extendIQ(Prefs);
    JXT.extendIQ(Fin);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(MAMQuery, DataForm);
    });

    JXT.withDefinition('forwarded', _xmppConstants.Namespace.FORWARD_0, function (Forwarded) {

        JXT.extend(Result, Forwarded);
    });

    JXT.withDefinition('set', _xmppConstants.Namespace.RSM, function (RSM) {

        JXT.extend(MAMQuery, RSM);
        JXT.extend(Fin, RSM);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=mam.js.map