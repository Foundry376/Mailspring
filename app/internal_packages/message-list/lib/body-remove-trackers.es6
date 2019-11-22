const digit0123 = '\\s*=\\s*[\'"]?(?:(?:0*(?:1|2|3)\\D)|0+\\D)';
const invisibleReStr = '(?:display\\s*:[\'"]?\\s*none)|(?:visibility\\s*:[\'"]?\\s*hidden)';
const smallOrInvisible = `(?:(?:width${digit0123})|(?:height${digit0123})|${invisibleReStr})`;

// Dont support double html tag with content
// 不支持有内容的双标签
const removeSimpleTagTracker = ['img', 'font', 'bgsound', 'embed', 'iframe', 'frame'];

// Dont support single html tag
// 不支持单标签
const removeVideoAudioObjectTracker = ['video', 'audio', 'object'];
const removeSecurityTag = ['script', 'iframe'];

function makeTagsReStr(tags) {
  return `<\\s*(${tags.join('|')})[^>]+(>[\r|\n|\\s]*</\\1>|/?>)`;
}

// RegExp "< ... (tag1|tag2|...)"
function tagBegin(tag) {
  const startStr = `<\\s*(${tag})(?!\\w|-)`;
  return new RegExp(startStr, 'g');
}

// RegExp "<... / tag ... >"
function tagEnd(tag) {
  const endStr = `<\\s*/\\s*${tag}\\s*>`;
  return new RegExp(endStr, 'g');
}

// Support only single html tag or empty content tag
// 仅支持单标签或无内容的双标签
function noEmbedTagsHandle(src, regEx, reRegEx, trackers) {
  let builder = '';
  const patternTag = new RegExp(regEx, 'g');
  const matcher = src.matchAll(patternTag);
  let currentIndex = 0;
  for (const marchstr of matcher) {
    const rematchStr = marchstr[0];
    const start = marchstr.index;
    const end = start + rematchStr.length;

    if (!reRegEx) {
      builder += src.substring(currentIndex, start);
      trackers.push(rematchStr);
      currentIndex = end;
    } else {
      const patternAttr = new RegExp(reRegEx, 'g');
      const matcherAttr = patternAttr.test(rematchStr);

      if (matcherAttr) {
        builder += src.substring(currentIndex, start);
        trackers.push(rematchStr);
        currentIndex = end;
      } else {
        builder += src.substring(currentIndex, end);
        currentIndex = end;
      }
    }
  }
  if (currentIndex == 0) {
    return src;
  } else {
    builder += src.substring(currentIndex);
  }
  return builder;
}

// Support only double html tag and it content dont has the same tag for it
// 仅支持双标签并且它里面没有嵌套和它同类型的标签
function embedTagsHandle(src, tag, reRegEx, trackers) {
  let builder = '';
  const patternTagStart = tagBegin(tag);
  const matcherStartList = [...src.matchAll(patternTagStart)];
  let currentStartIndex = 0;

  for (let i = 0; i < matcherStartList.length; i++) {
    const matcherStart = matcherStartList[i];
    const startIdx = matcherStart.index;
    if (startIdx < currentStartIndex) {
      continue;
    }
    const matchTagName = matcherStart[1];
    const patternTagEnd = tagEnd(matchTagName);
    const tmp = src.substring(startIdx);
    const matcherEndList = [...tmp.matchAll(patternTagEnd)];
    const pairMatcherEnd = matcherEndList[0];
    if (pairMatcherEnd) {
      const endIdx = pairMatcherEnd.index;
      const endTagStr = pairMatcherEnd[0];
      if (reRegEx) {
        const patternTagAttr = new RegExp(reRegEx);
        const stopIndex = matcherStartList[i + 1] ? matcherStartList[i + 1].index : endIdx;
        const testStr = src.substring(startIdx, stopIndex);
        const testResult = patternTagAttr.test(testStr);
        if (testResult) {
          const nextCurrentStartIndex = startIdx + endIdx + endTagStr.length;
          builder = builder + src.substring(currentStartIndex, startIdx);
          trackers.push(src.substring(startIdx, nextCurrentStartIndex));
          currentStartIndex = nextCurrentStartIndex;
        }
      } else {
        const nextCurrentStartIndex = startIdx + endIdx + endTagStr.length;
        builder = builder + src.substring(currentStartIndex, startIdx);
        trackers.push(src.substring(startIdx, nextCurrentStartIndex));
        currentStartIndex = nextCurrentStartIndex;
      }
    }
  }

  if (currentStartIndex == 0) {
    return src;
  } else {
    builder += src.substring(currentStartIndex);
  }
  return builder;
}

module.exports.removeTrackers = function removeTrackers(src) {
  const trackers = [];

  if (!src) {
    return { body: src, trackers };
  }
  let tmp;
  tmp = embedTagsHandle(src, removeSecurityTag.join('|'), '', trackers);
  tmp = noEmbedTagsHandle(tmp, makeTagsReStr(removeSimpleTagTracker), smallOrInvisible, trackers);
  tmp = embedTagsHandle(tmp, removeVideoAudioObjectTracker.join('|'), smallOrInvisible, trackers);
  return { body: tmp, trackers };
};
