'use strict';

module.exports = function (client) {

	client.disco.addFeature('urn:xmpp:push:0');

	client.enableNotifications = function(jid, node, fieldList, cb) {
		var fields = [{
			name: 'FORM_TYPE',
			value: 'http://jabber.org/protocol/pubsub#publish-options'
		}];
		var iq = {
			type: 'set',
			enablePush: {
				jid: jid,
				node: node,
			}
		};
		if (fieldList && fieldList.length) {
			iq.enablePush.form = {
				fields: fields.concat(fieldList)
			};
		}
		return this.sendIq(iq, cb);
	};

	client.disableNotifications = function(jid, node, cb) {
		var iq = {
			type: 'set',
			disablePush: {
				jid: jid
			}
		};
		if (node) {
			iq.disablePush.node = node;
		}
		return this.sendIq(iq, cb);
	};
};
