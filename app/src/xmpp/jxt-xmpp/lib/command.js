'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var ACTIONS = ['next', 'prev', 'complete', 'cancel'];

var CONDITIONS = ['bad-action', 'bad-locale', 'bad-payload', 'bad-sessionid', 'malformed-action', 'session-expired'];

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Command = JXT.define({
        name: 'command',
        namespace: _xmppConstants.Namespace.ADHOC_COMMANDS,
        element: 'command',
        fields: {
            action: Utils.attribute('action'),
            node: Utils.attribute('node'),
            sessionid: Utils.attribute('sessionid'),
            status: Utils.attribute('status'),
            execute: Utils.subAttribute(_xmppConstants.Namespace.ADHOC_COMMANDS, 'actions', 'execute'),
            actions: {
                get: function get() {

                    var result = [];
                    var actionSet = Utils.find(this.xml, _xmppConstants.Namespace.ADHOC_COMMANDS, 'actions');
                    if (!actionSet.length) {
                        return [];
                    }
                    ACTIONS.forEach(function (action) {

                        var existing = Utils.find(actionSet[0], _xmppConstants.Namespace.ADHOC_COMMANDS, action);
                        if (existing.length) {
                            result.push(action);
                        }
                    });
                    return result;
                },
                set: function set(values) {

                    var actionSet = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.ADHOC_COMMANDS, 'actions');
                    for (var i = 0, len = actionSet.childNodes.length; i < len; i++) {
                        actionSet.removeChild(actionSet.childNodes[i]);
                    }
                    values.forEach(function (value) {

                        actionSet.appendChild(Utils.createElement(_xmppConstants.Namespace.ADHOC_COMMANDS, value.toLowerCase(), _xmppConstants.Namespace.ADHOC_COMMANDS));
                    });
                }
            }
        }
    });

    var Note = JXT.define({
        name: '_commandNote',
        namespace: _xmppConstants.Namespace.ADHOC_COMMANDS,
        element: 'note',
        fields: {
            type: Utils.attribute('type'),
            value: Utils.text()
        }
    });

    JXT.extend(Command, Note, 'notes');

    JXT.extendIQ(Command);

    JXT.withStanzaError(function (StanzaError) {

        JXT.add(StanzaError, 'adhocCommandCondition', Utils.enumSub(_xmppConstants.Namespace.ADHOC_COMMANDS, CONDITIONS));
    });

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Command, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=command.js.map