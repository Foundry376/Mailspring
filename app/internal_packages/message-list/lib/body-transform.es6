const digit0123 = '\\s*=\\s*[\'"]?(?:(?:0*(?:1|2|3)\\D)|0+\\D)';
const invisibleReStr = '(?:display\\s*:[\'"]?\\s*none)|(?:visibility\\s*:[\'"]?\\s*hidden)';
const smallOrInvisible = `(?:(?:width${digit0123})|(?:height${digit0123})|${invisibleReStr})`;

const removeSimpleTagTracker = ['img', 'font', 'bgsound', 'embed', 'iframe', 'frame'];
const removeVideoAudioObjectTracker = ['video', 'audio', 'object', 'iframe'];
const removeSecurityTag = ['script', 'iframe'];

function makeTagsReStr(tags) {
  return `<\\s*(${tags.join('|')})[^>]+(>[\r|\n|\\s]*</\\1>|/?>)`;
}

// RegExp "< ... (tag1|tag2|...)"
function tagBegin(tag) {
  return `<\\s*(?:${tag})(?!\\w|-)`;
}

// RegExp "<... / tag ... >"
function tagEnd(tag) {
  return `<\\s*/\\s*${tag}\\s*>`;
}

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

function embedTagsHandle(src, tag, reRegEx, trackers) {
  const builder = '';
  const startTag = tagBegin(tag);
  const endTag = tagEnd(tag);
  const patternTagStart = new RegExp(startTag);
  const matcher = src.matchAll(patternTagStart);
  let currentIndex = 0;

  for (const marchstr of matcher) {
    const start = marchstr.index;
    const patternTagEnd = new RegExp(endTag);
    const tmp = src.substring(start);
    const matcherEnd = [...tmp.matchAll(patternTagEnd)];
    const changeLength = src.length - tmp.length;
    if (matcherEnd.length) {
      for (const endMatchStr of endMatch) {
        const rematchStr = endMatchStr[0];
        const end = endMatchStr.index + rematchStr.length;
        if (!reRegEx) {
          if (currentIndex < start) {
            builder += src.substring(currentIndex, start);
            trackers.push(src.substring(start, changeLength + end));
          }
        } else {
          const tmpTag = src.substring(start, changeLength + end);
          const patternAttr = new RegExp(reRegEx, 'g');
          const invisibleMatch = patternAttr.test(tmpTag);
          if (invisibleMatch) {
            if (currentIndex < start) {
              builder += src.substring(currentIndex, start);
              trackers.push(src.substring(start, changeLength + end));
            }
          } else {
            builder += src.substring(currentIndex, changeLength + end);
          }
        }
      }
      currentIndex = changeLength + end;
    } else {
      builder += src.substring(currentIndex, start);
      currentIndex = start;
    }
  }

  if (currentIndex == 0) {
    return src;
  } else {
    builder += src.substring(currentIndex);
  }
  return builder.toString();
}

export function removeTrackers(src) {
  const trackers = [];

  if (!src) {
    return { body: src, trackers };
  }
  let tmp;
  tmp = embedTagsHandle(src, removeSecurityTag.join('|'), '', trackers);
  tmp = noEmbedTagsHandle(tmp, makeTagsReStr(removeSimpleTagTracker), smallOrInvisible, trackers);
  tmp = embedTagsHandle(tmp, removeVideoAudioObjectTracker.join('|'), smallOrInvisible, trackers);
  return { body: tmp, trackers };
}
