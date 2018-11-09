'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _xmppJid = require('xmpp-jid');

exports['default'] = function (JXT) {

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'jidPrep', {
            get: function get() {

                var data = JXT.utils.getSubText(this.xml, _xmppConstants.Namespace.JID_PREP_0, 'jid');
                if (data) {
                    var jid = new _xmppJid.JID(data);
                    jid.prepped = true;
                    return jid;
                }
            },
            set: function set(value) {

                JXT.utils.setSubText(this.xml, _xmppConstants.Namespace.JID_PREP_0, 'jid', (value || '').toString());
            }
        });
    });
};

module.exports = exports['default'];
//# sourceMappingURL=jidprep.js.map