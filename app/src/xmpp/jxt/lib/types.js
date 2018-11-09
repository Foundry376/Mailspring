'use strict';

var helpers = require('./helpers');
var extend = require('lodash.assign');

var find = helpers.find;
var createElement = helpers.createElement;


var field = exports.field = function (getter, setter) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return {
            get: function () {
                return getter.apply(null, [this.xml].concat(args));
            },
            set: function (value) {
                setter.apply(null, ([this.xml].concat(args)).concat([value]));
            }
        };
    };
};

exports.boolAttribute = field(
    helpers.getBoolAttribute,
    helpers.setBoolAttribute);

exports.subAttribute = field(
    helpers.getSubAttribute,
    helpers.setSubAttribute);

exports.boolSubAttribute = field(
    helpers.getSubBoolAttribute,
    helpers.setSubBoolAttribute);

exports.text = field(
    helpers.getText,
    helpers.setText);

exports.textSub = exports.subText = field(
    helpers.getSubText,
    helpers.setSubText);

exports.multiTextSub = exports.multiSubText = field(
    helpers.getMultiSubText,
    helpers.setMultiSubText);

exports.multiSubAttribute  = field(
    helpers.getMultiSubAttribute,
    helpers.setMultiSubAttribute);

exports.langTextSub = exports.subLangText = field(
    helpers.getSubLangText,
    helpers.setSubLangText);

exports.boolSub = field(
    helpers.getBoolSub,
    helpers.setBoolSub);

exports.langAttribute = field(
    function (xml) {
        return xml.getAttributeNS(helpers.XML_NS, 'lang') || '';
    },
    function (xml, value) {
        xml.setAttributeNS(helpers.XML_NS, 'lang', value);
    }
);

exports.b64Text = field(
    function (xml) {
        if (xml.textContent && xml.textContent !== '=') {
            return new Buffer(xml.textContent, 'base64');
        }
        return '';
    },
    function (xml, value) {
        if (typeof value === 'string') {
            var b64 = (new Buffer(value)).toString('base64');
            xml.textContent = b64 || '=';
        } else {
            xml.textContent = '';
        }
    }
);

exports.dateAttribute = function (attr, now) {
    return {
        get: function () {
            var data = helpers.getAttribute(this.xml, attr);
            if (data) {
                return new Date(data);
            }
            if (now) {
                return new Date(Date.now());
            }
        },
        set: function (value) {
            if (!value) {
                return;
            }
            if (typeof value !== 'string') {
                value = value.toISOString();
            }
            helpers.setAttribute(this.xml, attr, value);
        }
    };
};

exports.dateSub = function (NS, sub, now) {
    return {
        get: function () {
            var data = helpers.getSubText(this.xml, NS, sub);
            if (data) {
                return new Date(data);
            }
            if (now) {
                return new Date(Date.now());
            }
        },
        set: function (value) {
            if (!value) {
                return;
            }
            if (typeof value !== 'string') {
                value = value.toISOString();
            }
            helpers.setSubText(this.xml, NS, sub, value);
        }
    };
};

exports.dateSubAttribute = function (NS, sub, attr, now) {
    return {
        get: function () {
            var data = helpers.getSubAttribute(this.xml, NS, sub, attr);
            if (data) {
                return new Date(data);
            }
            if (now) {
                return new Date(Date.now());
            }
        },
        set: function (value) {
            if (!value) {
                return;
            }
            if (typeof value !== 'string') {
                value = value.toISOString();
            }
            helpers.setSubAttribute(this.xml, NS, sub, attr, value);
        }
    };
};

exports.numberAttribute = function (attr, isFloat, defaultVal) {
    return {
        get: function () {
            var parse = isFloat ? parseFloat : parseInt;
            var data = helpers.getAttribute(this.xml, attr, '');
            if (!data) {
                return defaultVal;
            }
            var parsed = parse(data, 10);
            if (isNaN(parsed)) {
                return defaultVal;
            }

            return parsed;
        },
        set: function (value) {
            helpers.setAttribute(this.xml, attr, value.toString());
        }
    };
};

exports.numberSub = function (NS, sub, isFloat, defaultVal) {
    return {
        get: function () {
            var parse = isFloat ? parseFloat : parseInt;
            var data = helpers.getSubText(this.xml, NS, sub, '');
            if (!data) {
                return defaultVal;
            }

            var parsed = parse(data, 10);
            if (isNaN(parsed)) {
                return defaultVal;
            }

            return parsed;
        },
        set: function (value) {
            helpers.setSubText(this.xml, NS, sub, value.toString());
        }
    };
};

exports.numberSubAttribute = function (NS, sub, name, isFloat, defaultVal) {
    return {
        get: function () {
            var parse = isFloat ? parseFloat : parseInt;
            var data = helpers.getSubAttribute(this.xml, NS, sub, name, '');
            if (!data) {
                return defaultVal;
            }

            var parsed = parse(data, 10);
            if (isNaN(parsed)) {
                return defaultVal;
            }

            return parsed;
        },
        set: function (value) {
            helpers.setSubAttribute(this.xml, NS, sub, name, value.toString());
        }
    };
};

exports.attribute = function (name, defaultVal) {
    return {
        get: function () {
            return helpers.getAttribute(this.xml, name, defaultVal);
        },
        set: function (value) {
            helpers.setAttribute(this.xml, name, value);
        }
    };
};

exports.attributeNS = function (NS, name, defaultVal) {
    return {
        get: function () {
            return helpers.getAttributeNS(this.xml, NS, name, defaultVal);
        },
        set: function (value) {
            helpers.setAttributeNS(this.xml, NS, name, value);
        }
    };
};

exports.extension = function (ChildJXT) {
    return {
        get: function () {
            var self = this;
            var name = ChildJXT.prototype._name;
            if (!this._extensions[name]) {
                var existing = find(this.xml, ChildJXT.prototype._NS, ChildJXT.prototype._EL);
                if (!existing.length) {
                    this._extensions[name] = new ChildJXT({}, null, self);
                    this.xml.appendChild(this._extensions[name].xml);
                } else {
                    this._extensions[name] = new ChildJXT(null, existing[0], self);
                }
                this._extensions[name].parent = this;
            }
            return this._extensions[name];
        },
        set: function (value) {
            if (value) {
                var child = this[ChildJXT.prototype._name];
                if (value === true) {
                    value = {};
                }
                extend(child, value);
            }
        }
    };
};

exports.multiExtension = function (ChildJXT) {
    return {
        get: function () {
            var self = this;
            var data = find(this.xml, ChildJXT.prototype._NS, ChildJXT.prototype._EL);
            var results = [];

            for (var i = 0, len = data.length; i < len; i++) {
                results.push(new ChildJXT({}, data[i], self));
            }

            return results;
        },
        set: function (value) {
            value = value || [];

            var self = this;
            var existing = find(this.xml, ChildJXT.prototype._NS, ChildJXT.prototype._EL);

            var i, len;
            for (i = 0, len = existing.length; i < len; i++) {
                self.xml.removeChild(existing[i]);
            }

            for (i = 0, len = value.length; i < len; i++) {
                var content = new ChildJXT(value[i], null, self);
                self.xml.appendChild(content.xml);
            }
        }
    };
};

exports.enumSub = function (NS, enumValues) {
    return {
        get: function () {
            var self = this;
            var result = [];
            enumValues.forEach(function (enumVal) {
                var exists = find(self.xml, NS, enumVal);
                if (exists.length) {
                    result.push(exists[0].nodeName);
                }
            });
            return result[0] || '';
        },
        set: function (value) {
            var self = this;
            var alreadyExists = false;

            enumValues.forEach(function (enumVal) {
                var elements = find(self.xml, NS, enumVal);
                if (elements.length) {
                    if (enumVal === value) {
                        alreadyExists = true;
                    } else {
                        self.xml.removeChild(elements[0]);
                    }
                }
            });

            if (value && !alreadyExists) {
                var condition = createElement(NS, value);
                this.xml.appendChild(condition);
            }
        }
    };
};

exports.subExtension = function (name, NS, sub, ChildJXT) {
    return {
        get: function () {
            if (!this._extensions[name]) {
                var wrapper = find(this.xml, NS, sub);
                if (!wrapper.length) {
                    wrapper= createElement(NS, sub, this._NS);
                    this.xml.appendChild(wrapper);
                } else {
                    wrapper = wrapper[0];
                }

                var existing = find(wrapper, ChildJXT.prototype._NS, ChildJXT.prototype._EL);
                if (!existing.length) {
                    this._extensions[name] = new ChildJXT({}, null, {xml: wrapper});
                    wrapper.appendChild(this._extensions[name].xml);
                } else {
                    this._extensions[name] = new ChildJXT(null, existing[0], {xml: wrapper});
                }
                this._extensions[name].parent = this;
            }
            return this._extensions[name];
        },
        set: function (value) {
            var wrapper = find(this.xml, NS, sub);
            if (wrapper.length && !value) {
                this.xml.removeChild(wrapper[0]);
            }

            if (value) {
                var child = this[name];
                if (value === true) {
                    value = {};
                }
                extend(child, value);
            }
        }
    };
};

exports.subMultiExtension = function (NS, sub, ChildJXT) {
    return {
        get: function () {
            var self = this;
            var results = [];
            var existing = find(this.xml, NS, sub);
            if (!existing.length) {
                return results;
            }
            existing = existing[0];
            var data = find(existing, ChildJXT.prototype._NS, ChildJXT.prototype._EL);

            data.forEach(function (xml) {
                results.push(new ChildJXT({}, xml, self));
            });
            return results;
        },
        set: function (values) {
            var self = this;
            var existing = find(this.xml, NS, sub);
            if (existing.length) {
                self.xml.removeChild(existing[0]);
            }

            if (!values.length) {
                return;
            }

            existing = createElement(NS, sub, this._NS);

            values.forEach(function (value) {
                var content = new ChildJXT(value, null, {
                    xml: { namespaceURI: NS }
                });
                existing.appendChild(content.xml);
            });

            self.xml.appendChild(existing);
        }
    };
};
