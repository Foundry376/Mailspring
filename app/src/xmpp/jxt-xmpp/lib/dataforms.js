'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var _xmppJid = require('xmpp-jid');

var SINGLE_FIELDS = ['text-single', 'text-private', 'list-single', 'jid-single'];

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Field = JXT.define({
        name: '_field',
        namespace: _xmppConstants.Namespace.DATAFORM,
        element: 'field',
        init: function init(data) {

            this._type = (data || {}).type || this.type;
        },
        fields: {
            type: {
                get: function get() {

                    return Utils.getAttribute(this.xml, 'type', 'text-single');
                },
                set: function set(value) {

                    this._type = value;
                    Utils.setAttribute(this.xml, 'type', value);
                }
            },
            name: Utils.attribute('var'),
            desc: Utils.textSub(_xmppConstants.Namespace.DATAFORM, 'desc'),
            required: Utils.boolSub(_xmppConstants.Namespace.DATAFORM, 'required'),
            label: Utils.attribute('label'),
            value: {
                get: function get() {

                    var vals = Utils.getMultiSubText(this.xml, _xmppConstants.Namespace.DATAFORM, 'value');
                    if (this._type === 'boolean') {
                        return vals[0] === '1' || vals[0] === 'true';
                    }
                    if (vals.length > 1) {
                        if (this._type === 'text-multi') {
                            return vals.join('\n');
                        }

                        if (this._type === 'jid-multi') {
                            return vals.map(function (jid) {

                                return new _xmppJid.JID(jid);
                            });
                        }

                        return vals;
                    }
                    if (SINGLE_FIELDS.indexOf(this._type) >= 0) {
                        if (this._type === 'jid-single') {
                            return new _xmppJid.JID(vals[0]);
                        }
                        return vals[0];
                    }

                    return vals;
                },
                set: function set(value) {

                    if (this._type === 'boolean' || value === true || value === false) {
                        var truthy = value === true || value === 'true' || value === '1';
                        var sub = Utils.createElement(_xmppConstants.Namespace.DATAFORM, 'value', _xmppConstants.Namespace.DATAFORM);
                        sub.textContent = truthy ? '1' : '0';
                        this.xml.appendChild(sub);
                    } else {
                        if (this._type === 'text-multi' && typeof value === 'string') {
                            value = value.split('\n');
                        }
                        Utils.setMultiSubText(this.xml, _xmppConstants.Namespace.DATAFORM, 'value', value, (function (val) {

                            var sub = Utils.createElement(_xmppConstants.Namespace.DATAFORM, 'value', _xmppConstants.Namespace.DATAFORM);
                            sub.textContent = val;
                            this.xml.appendChild(sub);
                        }).bind(this));
                    }
                }
            }
        }
    });

    var Option = JXT.define({
        name: '_formoption',
        namespace: _xmppConstants.Namespace.DATAFORM,
        element: 'option',
        fields: {
            label: Utils.attribute('label'),
            value: Utils.textSub(_xmppConstants.Namespace.DATAFORM, 'value')
        }
    });

    var Item = JXT.define({
        name: '_formitem',
        namespace: _xmppConstants.Namespace.DATAFORM,
        element: 'item'
    });

    var Media = JXT.define({
        name: 'media',
        element: 'media',
        namespace: _xmppConstants.Namespace.DATAFORM_MEDIA,
        fields: {
            height: Utils.numberAttribute('height'),
            width: Utils.numberAttribute('width')
        }
    });

    var MediaURI = JXT.define({
        name: '_mediaURI',
        element: 'uri',
        namespace: _xmppConstants.Namespace.DATAFORM_MEDIA,
        fields: {
            uri: Utils.text(),
            type: Utils.attribute('type')
        }
    });

    var Validation = JXT.define({
        name: 'validation',
        element: 'validate',
        namespace: _xmppConstants.Namespace.DATAFORM_VALIDATION,
        fields: {
            dataType: Utils.attribute('datatype'),
            basic: Utils.boolSub(_xmppConstants.Namespace.DATAFORM_VALIDATION, 'basic'),
            open: Utils.boolSub(_xmppConstants.Namespace.DATAFORM_VALIDATION, 'open'),
            regex: Utils.textSub(_xmppConstants.Namespace.DATAFORM_VALIDATION, 'regex')
        }
    });

    var Range = JXT.define({
        name: 'range',
        element: 'range',
        namespace: _xmppConstants.Namespace.DATAFORM_VALIDATION,
        fields: {
            min: Utils.attribute('min'),
            max: Utils.attribute('max')
        }
    });

    var ListRange = JXT.define({
        name: 'select',
        element: 'list-range',
        namespace: _xmppConstants.Namespace.DATAFORM_VALIDATION,
        fields: {
            min: Utils.numberAttribute('min'),
            max: Utils.numberAttribute('max')
        }
    });

    var layoutContents = {
        get: function get() {

            var result = [];
            for (var i = 0, len = this.xml.childNodes.length; i < len; i++) {
                var child = this.xml.childNodes[i];
                if (child.namespaceURI !== _xmppConstants.Namespace.DATAFORM_LAYOUT) {
                    continue;
                }

                switch (child.localName) {
                    case 'text':
                        result.push({
                            text: child.textContent
                        });
                        break;
                    case 'fieldref':
                        result.push({
                            field: child.getAttribute('var')
                        });
                        break;
                    case 'reportedref':
                        result.push({
                            reported: true
                        });
                        break;
                    case 'section':
                        result.push({
                            section: new Section(null, child, this).toJSON()
                        });
                        break;
                }
            }

            return result;
        },
        set: function set(values) {

            for (var i = 0, len = values.length; i < len; i++) {
                var value = values[i];
                if (value.text) {
                    var text = Utils.createElement(_xmppConstants.Namespace.DATAFORM_LAYOUT, 'text', _xmppConstants.Namespace.DATAFORM_LAYOUT);
                    text.textContent = value.text;
                    this.xml.appendChild(text);
                }
                if (value.field) {
                    var field = Utils.createElement(_xmppConstants.Namespace.DATAFORM_LAYOUT, 'fieldref', _xmppConstants.Namespace.DATAFORM_LAYOUT);
                    field.setAttribute('var', value.field);
                    this.xml.appendChild(field);
                }
                if (value.reported) {
                    this.xml.appendChild(Utils.createElement(_xmppConstants.Namespace.DATAFORM_LAYOUT, 'reportedref', _xmppConstants.Namespace.DATAFORM_LAYOUT));
                }
                if (value.section) {
                    var sectionXML = Utils.createElement(_xmppConstants.Namespace.DATAFORM_LAYOUT, 'section', _xmppConstants.Namespace.DATAFORM_LAYOUT);
                    this.xml.appendChild(sectionXML);

                    var section = new Section(null, sectionXML);
                    section.label = value.section.label;
                    section.contents = value.section.contents;
                }
            }
        }
    };

    var Section = JXT.define({
        name: '_section',
        element: 'section',
        namespace: _xmppConstants.Namespace.DATAFORM_LAYOUT,
        fields: {
            label: Utils.attribute('label'),
            contents: layoutContents
        }
    });

    var Page = JXT.define({
        name: '_page',
        element: 'page',
        namespace: _xmppConstants.Namespace.DATAFORM_LAYOUT,
        fields: {
            label: Utils.attribute('label'),
            contents: layoutContents
        }
    });

    var DataForm = JXT.define({
        name: 'form',
        namespace: _xmppConstants.Namespace.DATAFORM,
        element: 'x',
        init: function init() {

            // Propagate reported field types to items

            if (!this.reportedFields.length) {
                return;
            }

            var fieldTypes = {};
            this.reportedFields.forEach(function (reported) {

                fieldTypes[reported.name] = reported.type;
            });
            this.items.forEach(function (item) {

                item.fields.forEach(function (field) {

                    field.type = field._type = fieldTypes[field.name];
                });
            });
        },
        fields: {
            title: Utils.textSub(_xmppConstants.Namespace.DATAFORM, 'title'),
            instructions: Utils.multiTextSub(_xmppConstants.Namespace.DATAFORM, 'instructions'),
            type: Utils.attribute('type', 'form'),
            reportedFields: Utils.subMultiExtension(_xmppConstants.Namespace.DATAFORM, 'reported', Field)
        }
    });

    JXT.extend(DataForm, Field, 'fields');
    JXT.extend(DataForm, Item, 'items');
    JXT.extend(DataForm, Page, 'layout');

    JXT.extend(Field, Media);
    JXT.extend(Field, Validation);
    JXT.extend(Field, Option, 'options');

    JXT.extend(Item, Field, 'fields');

    JXT.extend(Media, MediaURI, 'uris');
    JXT.extend(Validation, Range);
    JXT.extend(Validation, ListRange);

    JXT.extendMessage(DataForm);
};

module.exports = exports['default'];
//# sourceMappingURL=dataforms.js.map