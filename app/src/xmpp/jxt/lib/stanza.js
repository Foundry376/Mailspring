'use strict';

var helpers = require('./helpers');
var extend = require('lodash.assign');


var EXCLUDE = {
    constructor: true,
    parent: true,
    prototype: true,
    toJSON: true,
    toString: true,
    xml: true
};


module.exports = function (JXT, opts) {
    function Stanza(data, xml, parent) {
        var self = this;

        var parentNode = (xml || {}).parentNode || (parent || {}).xml;
        var parentNS = (parentNode || {}).namespaceURI;

        self.xml = xml || helpers.createElement(self._NS, self._EL, parentNS);

        Object.keys(self._PREFIXES).forEach(function (prefix) {
            var namespace = self._PREFIXES[prefix];
            self.xml.setAttribute('xmlns:' + prefix, namespace);
        });

        self._extensions = {};

        for (var i = 0, len = self.xml.childNodes.length; i < len; i++) {
            var child = self.xml.childNodes[i];
            var ChildJXT = JXT.getDefinition(child.localName, child.namespaceURI);
            if (ChildJXT !== undefined) {
                var name = ChildJXT.prototype._name;
                self._extensions[name] = new ChildJXT(null, child);
                self._extensions[name].parent = self;
            }
        }

        extend(self, data);

        if (opts.init) {
            opts.init.apply(self, [data]);
        }

        return self;
    }

    Stanza.prototype._isJXT = true;
    Stanza.prototype._name = opts.name;
    Stanza.prototype._eventname = opts.eventName;
    Stanza.prototype._NS = opts.namespace;
    Stanza.prototype._EL = opts.element || opts.name;
    Stanza.prototype._PREFIXES = opts.prefixes || {};
    Stanza.prototype._TAGS = opts.tags || [];

    Stanza.prototype.toString = function () {
        return this.xml.toString();
    };

    Stanza.prototype.toJSON = function () {
        var prop;
        var result = {};

        for (prop in this._extensions) {
            if (this._extensions[prop].toJSON && prop[0] !== '_') {
                result[prop] = this._extensions[prop].toJSON();
            }
        }

        for (prop in this) {
            var allowedName = !EXCLUDE[prop] && prop[0] !== '_';
            var isExtensionName = JXT.getExtensions(this._EL, this._NS)[prop];

            if (allowedName && !isExtensionName) {
                var val = this[prop];
                if (typeof val === 'function') {
                    continue;
                }
                var type = Object.prototype.toString.call(val);
                if (type.indexOf('Object') >= 0) {
                    if (Object.keys(val).length > 0) {
                        if (val._isJXT) {
                            result[prop] = val.toJSON();
                        } else {
                            result[prop] = val;
                        }
                    }
                } else if (type.indexOf('Array') >= 0) {
                    if (val.length > 0) {
                        var vals = [];
                        var len = val.length;
                        for (var n = 0; n < len; n++) {
                            var nval = val[n];
                            if (typeof nval !== 'undefined') {
                                if (nval._isJXT) {
                                    vals.push(nval.toJSON());
                                } else {
                                    vals.push(nval);
                                }
                            }
                        }
                        result[prop] = vals;
                    }
                } else if (val !== undefined && val !== false && val !== '') {
                    result[prop] = val;
                }
            }
        }

        return result;
    };

    return Stanza;
};
