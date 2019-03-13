'use strict';

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _addresses = require('./addresses');

var _addresses2 = _interopRequireDefault(_addresses);

var _avatar = require('./avatar');

var _avatar2 = _interopRequireDefault(_avatar);

var _bind = require('./bind');

var _bind2 = _interopRequireDefault(_bind);

var _blocking = require('./blocking');

var _blocking2 = _interopRequireDefault(_blocking);

var _bob = require('./bob');

var _bob2 = _interopRequireDefault(_bob);

var _bookmarks = require('./bookmarks');

var _bookmarks2 = _interopRequireDefault(_bookmarks);

var _bosh = require('./bosh');

var _bosh2 = _interopRequireDefault(_bosh);

// var _carbons = require('./carbons');

// var _carbons2 = _interopRequireDefault(_carbons);

var _command = require('./command');

var _command2 = _interopRequireDefault(_command);

var _csi = require('./csi');

var _csi2 = _interopRequireDefault(_csi);

var _dataforms = require('./dataforms');

var _dataforms2 = _interopRequireDefault(_dataforms);

var _delayed = require('./delayed');

var _delayed2 = _interopRequireDefault(_delayed);

var _disco = require('./disco');

var _disco2 = _interopRequireDefault(_disco);

var _error = require('./error');

var _error2 = _interopRequireDefault(_error);

var _extdisco = require('./extdisco');

var _extdisco2 = _interopRequireDefault(_extdisco);

var _file = require('./file');

var _file2 = _interopRequireDefault(_file);

var _file3 = require('./file3');

var _file32 = _interopRequireDefault(_file3);

var _forwarded = require('./forwarded');

var _forwarded2 = _interopRequireDefault(_forwarded);

var _framing = require('./framing');

var _framing2 = _interopRequireDefault(_framing);

var _geoloc = require('./geoloc');

var _geoloc2 = _interopRequireDefault(_geoloc);

var _hash = require('./hash');

var _hash2 = _interopRequireDefault(_hash);

var _hats = require('./hats');

var _hats2 = _interopRequireDefault(_hats);

var _iceUdp = require('./iceUdp');

var _iceUdp2 = _interopRequireDefault(_iceUdp);

var _ibb = require('./ibb');

var _ibb2 = _interopRequireDefault(_ibb);

var _iq = require('./iq');

var _iq2 = _interopRequireDefault(_iq);

var _jidprep = require('./jidprep');

var _jidprep2 = _interopRequireDefault(_jidprep);

var _jingle = require('./jingle');

var _jingle2 = _interopRequireDefault(_jingle);

var _json = require('./json');

var _json2 = _interopRequireDefault(_json);

var _logging = require('./logging');

var _logging2 = _interopRequireDefault(_logging);

var _mam = require('./mam');

var _mam2 = _interopRequireDefault(_mam);

var _message = require('./message');

var _message2 = _interopRequireDefault(_message);

var _e2ee = require('./e2ee');
var _e2ee2 = _interopRequireDefault(_e2ee);
var _ediencrypted = require('./ediencrypted');
var _ediencrypted2 = _interopRequireDefault(_ediencrypted);

var _edipull = require('./edipull');
var _edipull2 = _interopRequireDefault(_edipull);

var _mood = require('./mood');

var _mood2 = _interopRequireDefault(_mood);

var _muc = require('./muc');

var _muc2 = _interopRequireDefault(_muc);

var _nick = require('./nick');

var _nick2 = _interopRequireDefault(_nick);

var _oob = require('./oob');

var _oob2 = _interopRequireDefault(_oob);

var _ping = require('./ping');

var _ping2 = _interopRequireDefault(_ping);

var _presence = require('./presence');

var _presence2 = _interopRequireDefault(_presence);

var _private = require('./private');

var _private2 = _interopRequireDefault(_private);

var _psa = require('./psa');

var _psa2 = _interopRequireDefault(_psa);

var _pubsub = require('./pubsub');

var _pubsub2 = _interopRequireDefault(_pubsub);

var _pubsubError = require('./pubsubError');

var _pubsubError2 = _interopRequireDefault(_pubsubError);

var _pubsubEvents = require('./pubsubEvents');

var _pubsubEvents2 = _interopRequireDefault(_pubsubEvents);

var _pubsubOwner = require('./pubsubOwner');

var _pubsubOwner2 = _interopRequireDefault(_pubsubOwner);

var _push = require('./push');

var _push2 = _interopRequireDefault(_push);

var _reach = require('./reach');

var _reach2 = _interopRequireDefault(_reach);

var _register = require('./register');

var _register2 = _interopRequireDefault(_register);

var _references = require('./references');

var _references2 = _interopRequireDefault(_references);

var _roster = require('./roster');

var _roster2 = _interopRequireDefault(_roster);

var _rsm = require('./rsm');

var _rsm2 = _interopRequireDefault(_rsm);

var _rtp = require('./rtp');

var _rtp2 = _interopRequireDefault(_rtp);

var _rtt = require('./rtt');

var _rtt2 = _interopRequireDefault(_rtt);

var _sasl = require('./sasl');

var _sasl2 = _interopRequireDefault(_sasl);

var _session = require('./session');

var _session2 = _interopRequireDefault(_session);

var _shim = require('./shim');

var _shim2 = _interopRequireDefault(_shim);

var _sm = require('./sm');

var _sm2 = _interopRequireDefault(_sm);

var _stream = require('./stream');

var _stream2 = _interopRequireDefault(_stream);

var _streamError = require('./streamError');

var _streamError2 = _interopRequireDefault(_streamError);

var _streamFeatures = require('./streamFeatures');

var _streamFeatures2 = _interopRequireDefault(_streamFeatures);

var _time = require('./time');

var _time2 = _interopRequireDefault(_time);

var _tune = require('./tune');

var _tune2 = _interopRequireDefault(_tune);

var _vcard = require('./vcard');

var _vcard2 = _interopRequireDefault(_vcard);

var _version = require('./version');

var _version2 = _interopRequireDefault(_version);

var _visibility = require('./visibility');

var _visibility2 = _interopRequireDefault(_visibility);

exports['default'] = function (JXT) {

    JXT.use(_addresses2['default']);
    JXT.use(_avatar2['default']);
    JXT.use(_bind2['default']);
    JXT.use(_blocking2['default']);
    JXT.use(_bob2['default']);
    JXT.use(_bookmarks2['default']);
    JXT.use(_bosh2['default']);
    // JXT.use(_carbons2['default']);
    JXT.use(_command2['default']);
    JXT.use(_csi2['default']);
    JXT.use(_dataforms2['default']);
    JXT.use(_delayed2['default']);
    JXT.use(_disco2['default']);
    JXT.use(_error2['default']);
    JXT.use(_extdisco2['default']);
    JXT.use(_file2['default']);
    JXT.use(_file32['default']);
    JXT.use(_forwarded2['default']);
    JXT.use(_framing2['default']);
    JXT.use(_geoloc2['default']);
    JXT.use(_hash2['default']);
    JXT.use(_hats2['default']);
    JXT.use(_iceUdp2['default']);
    JXT.use(_ibb2['default']);
    JXT.use(_iq2['default']);
    JXT.use(_jidprep2['default']);
    JXT.use(_jingle2['default']);
    JXT.use(_json2['default']);
    JXT.use(_logging2['default']);
    JXT.use(_mam2['default']);
    JXT.use(_message2['default']);
    JXT.use(_mood2['default']);
    JXT.use(_muc2['default']);
    JXT.use(_nick2['default']);
    JXT.use(_oob2['default']);
    JXT.use(_ping2['default']);
    JXT.use(_presence2['default']);
    JXT.use(_private2['default']);
    JXT.use(_psa2['default']);
    JXT.use(_pubsub2['default']);
    JXT.use(_pubsubError2['default']);
    JXT.use(_pubsubEvents2['default']);
    JXT.use(_pubsubOwner2['default']);
    JXT.use(_push2['default']);
    JXT.use(_reach2['default']);
    JXT.use(_register2['default']);
    JXT.use(_references2['default']);
    JXT.use(_roster2['default']);
    JXT.use(_rsm2['default']);
    JXT.use(_rtp2['default']);
    JXT.use(_rtt2['default']);
    JXT.use(_sasl2['default']);
    JXT.use(_session2['default']);
    JXT.use(_shim2['default']);
    JXT.use(_sm2['default']);
    JXT.use(_stream2['default']);
    JXT.use(_streamError2['default']);
    JXT.use(_streamFeatures2['default']);
    JXT.use(_time2['default']);
    JXT.use(_tune2['default']);
    JXT.use(_vcard2['default']);
    JXT.use(_version2['default']);
    JXT.use(_visibility2['default']);
    JXT.use(_e2ee2['default']);
    JXT.use(_ediencrypted2['default']);
    JXT.use(_edipull['default']);
};

module.exports = exports['default'];
//# sourceMappingURL=index.js.map