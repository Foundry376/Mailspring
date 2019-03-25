export function isJsonString(str) {
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
    } else if (typeof str == 'object') {
        return true;
    }
    return false;
}

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
  str.match(/(\.gif|\.bmp|\.png|\.jpg|\.jpeg)$/)
}
