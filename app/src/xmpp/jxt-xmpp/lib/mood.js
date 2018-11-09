'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var MOODS = ['afraid', 'amazed', 'amorous', 'angry', 'annoyed', 'anxious', 'aroused', 'ashamed', 'bored', 'brave', 'calm', 'cautious', 'cold', 'confident', 'confused', 'contemplative', 'contented', 'cranky', 'crazy', 'creative', 'curious', 'dejected', 'depressed', 'disappointed', 'disgusted', 'dismayed', 'distracted', 'embarrassed', 'envious', 'excited', 'flirtatious', 'frustrated', 'grateful', 'grieving', 'grumpy', 'guilty', 'happy', 'hopeful', 'hot', 'humbled', 'humiliated', 'hungry', 'hurt', 'impressed', 'in_awe', 'in_love', 'indignant', 'interested', 'intoxicated', 'invincible', 'jealous', 'lonely', 'lucky', 'mean', 'moody', 'nervous', 'neutral', 'offended', 'outraged', 'playful', 'proud', 'relaxed', 'relieved', 'remorseful', 'restless', 'sad', 'sarcastic', 'serious', 'shocked', 'shy', 'sick', 'sleepy', 'spontaneous', 'stressed', 'strong', 'surprised', 'thankful', 'thirsty', 'tired', 'undefined', 'weak', 'worried'];

exports['default'] = function (JXT) {

    var Mood = JXT.define({
        name: 'mood',
        namespace: _xmppConstants.Namespace.MOOD,
        element: 'mood',
        fields: {
            text: JXT.utils.textSub(_xmppConstants.Namespace.MOOD, 'text'),
            value: JXT.utils.enumSub(_xmppConstants.Namespace.MOOD, MOODS)
        }
    });

    JXT.extendMessage(Mood);
    JXT.extendPubsubItem(Mood);
};

module.exports = exports['default'];
//# sourceMappingURL=mood.js.map