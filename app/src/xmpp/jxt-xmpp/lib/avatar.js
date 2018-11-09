'use strict';

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _lodashForeach = require('lodash.foreach');

var _lodashForeach2 = _interopRequireDefault(_lodashForeach);

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Avatar = JXT.define({
        name: 'avatar',
        namespace: _xmppConstants.Namespace.AVATAR_METADATA,
        element: 'info',
        fields: {
            id: Utils.attribute('id'),
            bytes: Utils.attribute('bytes'),
            height: Utils.attribute('height'),
            width: Utils.attribute('width'),
            type: Utils.attribute('type', 'image/png'),
            url: Utils.attribute('url')
        }
    });

    var avatars = {
        get: function get() {

            var metadata = Utils.find(this.xml, _xmppConstants.Namespace.AVATAR_METADATA, 'metadata');
            var results = [];
            if (metadata.length) {
                var _avatars = Utils.find(metadata[0], _xmppConstants.Namespace.AVATAR_METADATA, 'info');
                (0, _lodashForeach2['default'])(_avatars, function (info) {

                    results.push(new Avatar({}, info));
                });
            }
            return results;
        },
        set: function set(value) {

            var metadata = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.AVATAR_METADATA, 'metadata');
            Utils.setAttribute(metadata, 'xmlns', _xmppConstants.Namespace.AVATAR_METADATA);
            (0, _lodashForeach2['default'])(value, function (info) {

                var avatar = new Avatar(info);
                metadata.appendChild(avatar.xml);
            });
        }
    };

    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'avatars', avatars);
        JXT.add(Item, 'avatarData', Utils.textSub(_xmppConstants.Namespace.AVATAR_DATA, 'data'));
    });
};

module.exports = exports['default'];
//# sourceMappingURL=avatar.js.map