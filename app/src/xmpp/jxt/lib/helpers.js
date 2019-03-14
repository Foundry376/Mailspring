'use strict';

var ltx = require('ltx');
var DOMElement = require('ltx/lib/DOMElement');

var XML_NS = exports.XML_NS = 'http://www.w3.org/XML/1998/namespace';


exports.parse = function (str) {
    var xml = ltx.parse(str, {
        Element: DOMElement
    });
    if (xml.nodeType !== 1) {
        return;
    }
    return xml;
};

exports.createElement = function (NS, name, parentNS) {
    var el = new DOMElement(name);
    if (!parentNS || parentNS !== NS) {
        exports.setAttribute(el, 'xmlns', NS);
    }
    return el;
};

var find = exports.find = function (xml, NS, selector) {
    var results = [];
    var children = xml.getElementsByTagName(selector);
    for (var i = 0, len = children.length; i < len; i++) {
        var child = children[i];
        if ((child.namespaceURI === NS
            || (!NS && (selector == 'memberschange' || selector == 'member')))
            && child.parentNode === xml) {
            results.push(child);
        }
    }
    return results;
};

exports.findOrCreate = function (xml, NS, selector) {
    var existing = exports.find(xml, NS, selector);
    if (existing.length) {
        return existing[0];
    } else {
        var created = exports.createElement(NS, selector, xml.namespaceURI);
        xml.appendChild(created);
        return created;
    }
};

exports.getAttribute = function (xml, attr, defaultVal) {
    return xml.getAttribute(attr) || defaultVal || '';
};

exports.getAttributeNS = function (xml, NS, attr, defaultVal) {
    return xml.getAttributeNS(NS, attr) || defaultVal || '';
};

exports.setAttribute = function (xml, attr, value, force) {
    if (value || force) {
        xml.setAttribute(attr, value);
    } else {
        xml.removeAttribute(attr);
    }
};

exports.setAttributeNS = function (xml, NS, attr, value, force) {
    if (value || force) {
        xml.setAttributeNS(NS, attr, value);
    } else {
        xml.removeAttributeNS(NS, attr);
    }
};

exports.getBoolAttribute = function (xml, attr, defaultVal) {
    var val = xml.getAttribute(attr) || defaultVal || '';
    return val === 'true' || val === '1';
};

exports.setBoolAttribute = function (xml, attr, value) {
    if (value) {
        xml.setAttribute(attr, '1');
    } else {
        xml.removeAttribute(attr);
    }
};

exports.getSubAttribute = function (xml, NS, sub, attr, defaultVal) {
    var subs = find(xml, NS, sub);
    if (!subs) {
        return '';
    }

    for (var i = 0; i < subs.length; i++) {
        return subs[i].getAttribute(attr) || defaultVal || '';
    }

    return '';
};

exports.setSubAttribute2 = function (xml, NS, sub, attr, value) {
    var subs = find(xml, NS, sub);
    sub = exports.createElement(NS, sub, xml.namespaceURI);
    sub.setAttribute(attr, value);
    xml.appendChild(sub);
};
exports.setSubAttribute = function (xml, NS, sub, attr, value) {
    var subs = find(xml, NS, sub);
    if (!subs.length) {
        if (value) {
            sub = exports.createElement(NS, sub, xml.namespaceURI);
            sub.setAttribute(attr, value);
            xml.appendChild(sub);
        }
    } else {
        for (var i = 0; i < subs.length; i++) {
            if (value) {
                subs[i].setAttribute(attr, value);
                return;
            } else {
                subs[i].removeAttribute(attr);
            }
        }
    }
};

exports.getBoolSubAttribute = function (xml, NS, sub, attr, defaultVal) {
    var val = xml.getSubAttribute(NS, sub, attr) || defaultVal || '';
    return val === 'true' || val === '1';
};

exports.setBoolSubAttribute = function (xml, NS, sub, attr, value) {
    value = value ? '1' : '';
    exports.setSubAttribute(xml, NS, sub, attr, value);
};

exports.getText = function (xml) {
    return xml.textContent;
};

exports.setText = function (xml, value) {
    xml.textContent = value;
};

exports.getSubText = exports.getTextSub = function (xml, NS, element, defaultVal) {
    var subs = find(xml, NS, element);

    defaultVal = defaultVal || '';

    if (!subs.length) {
        return defaultVal;
    }

    return subs[0].textContent || defaultVal;
};

exports.setSubText = exports.setTextSub = function (xml, NS, element, value) {
    var subs = find(xml, NS, element);
    if (subs.length) {
        for (var i = 0; i < subs.length; i++) {
            xml.removeChild(subs[i]);
        }
    }

    if (value) {
        var sub = exports.createElement(NS, element, xml.namespaceURI);
        if (value !== true) {
            sub.textContent = value;
        }
        xml.appendChild(sub);
    }
};

exports.getMultiSubText = function (xml, NS, element, extractor) {
    var subs = find(xml, NS, element);
    var results = [];

    extractor = extractor || function (sub) {
        return sub.textContent || '';
    };

    for (var i = 0; i < subs.length; i++) {
        results.push(extractor(subs[i]));
    }

    return results;
};

exports.setMultiSubText = function (xml, NS, element, value, builder) {
    var subs = find(xml, NS, element);
    var values = [];
    builder = builder || function (value) {
        if (value) {
            var sub = exports.createElement(NS, element, xml.namespaceURI);
            sub.textContent = value;
            xml.appendChild(sub);
        }
    };
    if (typeof value === 'string') {
        values = (value || '').split('\n');
    } else {
        values = value;
    }

    var i, len;
    for (i = 0, len = subs.length; i < len; i++) {
        xml.removeChild(subs[i]);
    }

    for (i = 0, len = values.length; i < len; i++) {
        builder(values[i]);
    }
};

exports.getMultiSubAttribute = function (xml, NS, element, attr) {
    return exports.getMultiSubText(xml, NS, element, function (sub) {
        return exports.getAttribute(sub, attr);
    });
};

exports.setMultiSubAttribute = function (xml, NS, element, attr, value) {
    exports.setMultiSubText(xml, NS, element, value, function (val) {
        var sub = exports.createElement(NS, element, xml.namespaceURI);
        exports.setAttribute(sub, attr, val);
        xml.appendChild(sub);
    });
};

exports.getElements = function (xml, NS, element) {
    var subs = find(xml, NS, element);
    if (!subs.length) {
        return {};
    }
    return subs;
}
exports.getSubLangTextEx = function (xml, NS, element, attr) {
    var subs = find(xml, NS, element);
    if (!subs.length) {
        return {};
    }

    var lang, sub;
    var results = {};
    //var langs = [];

    for (var i = 0; i < subs.length; i++) {
        sub = subs[i];
        lang = sub.getAttribute(attr);
        //langs.push(lang);
        if (lang) {
            results[lang] = sub.textContent || '';
        }
    }

    return results;
};
exports.getSubLangText = function (xml, NS, element, defaultLang) {
    var subs = find(xml, NS, element);
    if (!subs.length) {
        return {};
    }

    var lang, sub;
    var results = {};
    var langs = [];

    for (var i = 0; i < subs.length; i++) {
        sub = subs[i];
        lang = sub.getAttributeNS(XML_NS, 'lang') || defaultLang;
        langs.push(lang);
        results[lang] = sub.textContent || '';
    }

    return results;
};

exports.setSubLangText = function (xml, NS, element, value, defaultLang) {
    var sub, lang;
    var subs = find(xml, NS, element);
    if (subs.length) {
        for (var i = 0; i < subs.length; i++) {
            xml.removeChild(subs[i]);
        }
    }

    if (typeof value === 'string') {
        sub = exports.createElement(NS, element, xml.namespaceURI);
        sub.textContent = value;
        xml.appendChild(sub);
    } else if (typeof value === 'object') {
        for (lang in value) {
            if (value.hasOwnProperty(lang)) {
                sub = exports.createElement(NS, element, xml.namespaceURI);
                if (lang !== defaultLang) {
                    sub.setAttributeNS(XML_NS, 'lang', lang);
                }
                sub.textContent = value[lang];
                xml.appendChild(sub);
            }
        }
    }
};

exports.getBoolSub = function (xml, NS, element) {
    var subs = find(xml, NS, element);
    return !!subs.length;
};

exports.setBoolSub = function (xml, NS, element, value) {
    var subs = find(xml, NS, element);
    if (!subs.length) {
        if (value) {
            var sub = exports.createElement(NS, element, xml.namespaceURI);
            xml.appendChild(sub);
        }
    } else {
        for (var i = 0; i < subs.length; i++) {
            if (value) {
                return;
            } else {
                xml.removeChild(subs[i]);
            }
        }
    }
};
