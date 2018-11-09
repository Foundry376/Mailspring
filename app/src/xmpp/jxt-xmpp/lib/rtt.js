'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var TYPE_MAP = {
    insert: 't',
    erase: 'e',
    wait: 'w'
};

var ACTION_MAP = {
    t: 'insert',
    e: 'erase',
    w: 'wait'
};

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var RTT = JXT.define({
        name: 'rtt',
        namespace: _xmppConstants.Namespace.RTT_0,
        element: 'rtt',
        fields: {
            id: Utils.attribute('id'),
            event: Utils.attribute('event', 'edit'),
            seq: Utils.numberAttribute('seq'),
            actions: {
                get: function get() {

                    var results = [];
                    for (var i = 0, len = this.xml.childNodes.length; i < len; i++) {
                        var child = this.xml.childNodes[i];
                        var _name = child.localName;
                        var action = {};

                        if (child.namespaceURI !== _xmppConstants.Namespace.RTT_0) {
                            continue;
                        }

                        if (ACTION_MAP[_name]) {
                            action.type = ACTION_MAP[_name];
                        } else {
                            continue;
                        }

                        var pos = Utils.getAttribute(child, 'p');
                        if (pos) {
                            action.pos = parseInt(pos, 10);
                        }

                        var n = Utils.getAttribute(child, 'n');
                        if (n) {
                            action.num = parseInt(n, 10);
                        }

                        var t = Utils.getText(child);
                        if (t && _name === 't') {
                            action.text = t;
                        }

                        results.push(action);
                    }

                    return results;
                },
                set: function set(actions) {

                    var self = this;

                    for (var i = 0, len = this.xml.childNodes.length; i < len; i++) {
                        this.xml.removeChild(this.xml.childNodes[i]);
                    }

                    actions.forEach(function (action) {

                        if (!TYPE_MAP[action.type]) {
                            return;
                        }

                        var child = Utils.createElement(_xmppConstants.Namespace.RTT_0, TYPE_MAP[action.type], _xmppConstants.Namespace.RTT_0);

                        if (action.pos !== undefined) {
                            Utils.setAttribute(child, 'p', action.pos.toString());
                        }

                        if (action.num) {
                            Utils.setAttribute(child, 'n', action.num.toString());
                        }

                        if (action.text) {
                            Utils.setText(child, action.text);
                        }

                        self.xml.appendChild(child);
                    });
                }
            }
        }
    });

    JXT.extendMessage(RTT);
};

module.exports = exports['default'];
//# sourceMappingURL=rtt.js.map