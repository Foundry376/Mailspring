'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var JSONExtension = {
        get: function get() {

            var data = JXT.utils.getSubText(this.xml, _xmppConstants.Namespace.JSON_0, 'json');
            if (data) {
                return JSON.parse(data);
            }
        },
        set: function set(value) {

            value = JSON.stringify(value);
            if (value) {
                JXT.utils.setSubText(this.xml, _xmppConstants.Namespace.JSON_0, 'json', value);
            }
        }
    };

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'json', JSONExtension);
    });

    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'json', JSONExtension);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=json.js.map