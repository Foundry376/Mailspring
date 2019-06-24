export function isJsonStr(str) {
  if (typeof str == 'string') {
    try {
      var obj = JSON.parse(str);
      if (typeof obj == 'object' && obj) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  } else {
      return false;
  }
}

export function isImageFilePath(str) {
  return str.match(/(\.gif|\.bmp|\.png|\.jpg|\.jpeg)$/)
}