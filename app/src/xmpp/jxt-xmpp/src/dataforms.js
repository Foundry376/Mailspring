import { Namespace as NS } from 'xmpp-constants';
import { JID } from 'xmpp-jid';


let SINGLE_FIELDS = [
    'text-single',
    'text-private',
    'list-single',
    'jid-single'
];


export default function (JXT) {

    let Utils = JXT.utils;


    let Field = JXT.define({
        name: '_field',
        namespace: NS.DATAFORM,
        element: 'field',
        init: function (data) {

            this._type = (data || {}).type || this.type;
        },
        fields: {
            type: {
                get: function () {

                    return Utils.getAttribute(this.xml, 'type', 'text-single');
                },
                set: function (value) {

                    this._type = value;
                    Utils.setAttribute(this.xml, 'type', value);
                }
            },
            name: Utils.attribute('var'),
            desc: Utils.textSub(NS.DATAFORM, 'desc'),
            required: Utils.boolSub(NS.DATAFORM, 'required'),
            label: Utils.attribute('label'),
            value: {
                get: function () {

                    let vals = Utils.getMultiSubText(this.xml, NS.DATAFORM, 'value');
                    if (this._type === 'boolean') {
                        return vals[0] === '1' || vals[0] === 'true';
                    }
                    if (vals.length > 1) {
                        if (this._type === 'text-multi') {
                            return vals.join('\n');
                        }

                        if (this._type === 'jid-multi') {
                            return vals.map(function (jid) {

                                return new JID(jid);
                            });
                        }

                        return vals;
                    }
                    if (SINGLE_FIELDS.indexOf(this._type) >= 0) {
                        if (this._type === 'jid-single') {
                            return new JID(vals[0]);
                        }
                        return vals[0];
                    }

                    return vals;
                },
                set: function (value) {

                    if (this._type === 'boolean' || value === true || value === false) {
                        let truthy = value === true || value === 'true' || value === '1';
                        let sub = Utils.createElement(NS.DATAFORM, 'value', NS.DATAFORM);
                        sub.textContent = truthy ? '1' : '0';
                        this.xml.appendChild(sub);
                    } else {
                        if (this._type === 'text-multi' && typeof value === 'string') {
                            value = value.split('\n');
                        }
                        Utils.setMultiSubText(this.xml, NS.DATAFORM, 'value', value, function (val) {

                            let sub = Utils.createElement(NS.DATAFORM, 'value', NS.DATAFORM);
                            sub.textContent = val;
                            this.xml.appendChild(sub);
                        }.bind(this));
                    }
                }
            }
        }
    });

    let Option = JXT.define({
        name: '_formoption',
        namespace: NS.DATAFORM,
        element: 'option',
        fields: {
            label: Utils.attribute('label'),
            value: Utils.textSub(NS.DATAFORM, 'value')
        }
    });

    let Item = JXT.define({
        name: '_formitem',
        namespace: NS.DATAFORM,
        element: 'item'
    });

    let Media = JXT.define({
        name: 'media',
        element: 'media',
        namespace: NS.DATAFORM_MEDIA,
        fields: {
            height: Utils.numberAttribute('height'),
            width: Utils.numberAttribute('width')
        }
    });

    let MediaURI = JXT.define({
        name: '_mediaURI',
        element: 'uri',
        namespace: NS.DATAFORM_MEDIA,
        fields: {
            uri: Utils.text(),
            type: Utils.attribute('type')
        }
    });

    let Validation = JXT.define({
        name: 'validation',
        element: 'validate',
        namespace: NS.DATAFORM_VALIDATION,
        fields: {
            dataType: Utils.attribute('datatype'),
            basic: Utils.boolSub(NS.DATAFORM_VALIDATION, 'basic'),
            open: Utils.boolSub(NS.DATAFORM_VALIDATION, 'open'),
            regex: Utils.textSub(NS.DATAFORM_VALIDATION, 'regex')
        }
    });

    let Range = JXT.define({
        name: 'range',
        element: 'range',
        namespace: NS.DATAFORM_VALIDATION,
        fields: {
            min: Utils.attribute('min'),
            max: Utils.attribute('max')
        }
    });

    let ListRange = JXT.define({
        name: 'select',
        element: 'list-range',
        namespace: NS.DATAFORM_VALIDATION,
        fields: {
            min: Utils.numberAttribute('min'),
            max: Utils.numberAttribute('max')
        }
    });

    let layoutContents = {
        get: function () {

            let result = [];
            for (let i = 0, len = this.xml.childNodes.length; i < len; i++) {
                let child = this.xml.childNodes[i];
                if (child.namespaceURI !== NS.DATAFORM_LAYOUT) {
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
        set: function (values) {

            for (let i = 0, len = values.length; i < len; i++) {
                let value = values[i];
                if (value.text) {
                    let text = Utils.createElement(NS.DATAFORM_LAYOUT, 'text', NS.DATAFORM_LAYOUT);
                    text.textContent = value.text;
                    this.xml.appendChild(text);
                }
                if (value.field) {
                    let field = Utils.createElement(NS.DATAFORM_LAYOUT, 'fieldref', NS.DATAFORM_LAYOUT);
                    field.setAttribute('var', value.field);
                    this.xml.appendChild(field);
                }
                if (value.reported) {
                    this.xml.appendChild(Utils.createElement(NS.DATAFORM_LAYOUT, 'reportedref', NS.DATAFORM_LAYOUT));
                }
                if (value.section) {
                    let sectionXML = Utils.createElement(NS.DATAFORM_LAYOUT, 'section', NS.DATAFORM_LAYOUT);
                    this.xml.appendChild(sectionXML);

                    let section = new Section(null, sectionXML);
                    section.label = value.section.label;
                    section.contents = value.section.contents;
                }
            }
        }
    };

    let Section = JXT.define({
        name: '_section',
        element: 'section',
        namespace: NS.DATAFORM_LAYOUT,
        fields: {
            label: Utils.attribute('label'),
            contents: layoutContents
        }
    });

    let Page = JXT.define({
        name: '_page',
        element: 'page',
        namespace: NS.DATAFORM_LAYOUT,
        fields: {
            label: Utils.attribute('label'),
            contents: layoutContents
        }
    });

    let DataForm = JXT.define({
        name: 'form',
        namespace: NS.DATAFORM,
        element: 'x',
        init: function () {

            // Propagate reported field types to items

            if (!this.reportedFields.length) {
                return;
            }

            let fieldTypes = {};
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
            title: Utils.textSub(NS.DATAFORM, 'title'),
            instructions: Utils.multiTextSub(NS.DATAFORM, 'instructions'),
            type: Utils.attribute('type', 'form'),
            reportedFields: Utils.subMultiExtension(NS.DATAFORM, 'reported', Field)
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
}
