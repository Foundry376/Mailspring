'use strict';

var extend = require('lodash.assign');
var uuid = require('uuid');

var types = require('./lib/types');
var helpers = require('./lib/helpers');
var stanzaConstructor = require('./lib/stanza');


function JXT() {
    this._LOOKUP = {};
    this._LOOKUP_EXT = {};
    this._TAGS = {};
    this._CB_DEFINITION = {};
    this._CB_TAG = {};
    this._ID = uuid.v4();
    this.utils = extend({}, types, helpers);
}

JXT.prototype.use = function (init) {
    if (!init || typeof init !== 'function') {
        return this;
    }
    if (!init['__JXT_LOADED_' + this._ID]) {
        init(this);
        init['__JXT_LOADED_' + this._ID] = true;
    }
    return this;
};

JXT.prototype.getDefinition = function (el, ns, required) {
    var JXTClass = this._LOOKUP[ns + '|' + el];
    if (required && !JXTClass) {
        throw new Error('Could not find definition for <' + el + ' xmlns="' + ns + '" />');
    }
    if(!JXTClass&&!ns&&(el=='iq'||el=='message')){
        JXTClass = this._LOOKUP['jabber:client|' + el];
    }
    return JXTClass;
};

JXT.prototype.getExtensions = function (el, ns) {
    return this._LOOKUP_EXT[ns + '|' + el] || {};
};

JXT.prototype.withDefinition = function (el, ns, cb) {
    var name = ns + '|' + el;
    if (!this._CB_DEFINITION[name]) {
        this._CB_DEFINITION[name] = [];
    }
    this._CB_DEFINITION[name].push(cb);

    if (this._LOOKUP[name]) {
        cb(this._LOOKUP[name]);
    }
};

JXT.prototype.withTag = function (tag, cb) {
    if (!this._CB_TAG[tag]) {
        this._CB_TAG[tag] = [];
    }
    this._CB_TAG[tag].push(cb);

    this.tagged(tag).forEach(function (stanza) {
        cb(stanza);
    });
};

JXT.prototype.tagged = function (tag) {
    return this._TAGS[tag] || [];
};

JXT.prototype.build = function (xml) {
    var JXTClass = this.getDefinition(xml.localName, xml.namespaceURI);
    if (JXTClass) {
        return new JXTClass(null, xml);
    }
};

JXT.prototype.parse = function (str) {
    var xml = helpers.parse(str);
    if (!xml) {
        return;
    }
    return this.build(xml);
};
JXT.prototype.parseXml = function (str) {
    return helpers.parse(str);
};

JXT.prototype.extend = function (ParentJXT, ChildJXT, multiName, hideSingle) {
    var parentName = ParentJXT.prototype._NS + '|' + ParentJXT.prototype._EL;
    var name = ChildJXT.prototype._name;
    var qName = ChildJXT.prototype._NS + '|' + ChildJXT.prototype._EL;

    this._LOOKUP[qName] = ChildJXT;
    if (!this._LOOKUP_EXT[qName]) {
        this._LOOKUP_EXT[qName] = {};
    }
    if (!this._LOOKUP_EXT[parentName]) {
        this._LOOKUP_EXT[parentName] = {};
    }
    this._LOOKUP_EXT[parentName][name] = ChildJXT;

    if (!multiName || (multiName && !hideSingle)) {
        this.add(ParentJXT, name, types.extension(ChildJXT));
    }
    if (multiName) {
        this.add(ParentJXT, multiName, types.multiExtension(ChildJXT));
    }
};

JXT.prototype.add = function (ParentJXT, fieldName, field) {
    field.enumerable = true;
    Object.defineProperty(ParentJXT.prototype, fieldName, field);
};

JXT.prototype.define = function (opts) {
    var self = this;

    var Stanza = stanzaConstructor(this, opts);

    var ns = Stanza.prototype._NS;
    var el = Stanza.prototype._EL;
    var tags = Stanza.prototype._TAGS;

    var name = ns + '|' + el;
    this._LOOKUP[name] = Stanza;

    tags.forEach(function (tag) {
        if (!self._TAGS[tag]) {
            self._TAGS[tag] = [];
        }
        self._TAGS[tag].push(Stanza);
    });

    var fieldNames = Object.keys(opts.fields || {});
    fieldNames.forEach(function (fieldName) {
        self.add(Stanza, fieldName, opts.fields[fieldName]);
    });

    if (this._CB_DEFINITION[name]) {
        this._CB_DEFINITION[name].forEach(function (handler) {
            handler(Stanza);
        });
    }

    tags.forEach(function (tag) {
        if (self._CB_TAG[tag]) {
            self._CB_TAG[tag].forEach(function (handler) {
                handler(Stanza);
            });
        }
    });

    return Stanza;
};


// Expose methods on the required module itself


JXT.createRegistry = function () {
    return new JXT();
};

extend(JXT, helpers);
extend(JXT, types);

// Compatibility shim for JXT 1.x

var globalJXT = new JXT();

JXT.define = globalJXT.define.bind(globalJXT);
JXT.extend = globalJXT.extend.bind(globalJXT);
JXT.add = globalJXT.add.bind(globalJXT);
JXT.parse = globalJXT.parse.bind(globalJXT);
JXT.build = globalJXT.build.bind(globalJXT);
JXT.getExtensions = globalJXT.getExtensions.bind(globalJXT);
JXT.getDefinition = globalJXT.getDefinition.bind(globalJXT);
JXT.withDefinition = globalJXT.withDefinition.bind(globalJXT);
JXT.withTag = globalJXT.withTag.bind(globalJXT);
JXT.tagged = globalJXT.tagged.bind(globalJXT);

JXT.getGlobalJXT = function () {
    return globalJXT;
};

module.exports = JXT;
