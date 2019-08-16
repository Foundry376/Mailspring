/* eslint-disable prettier/prettier */
import React from 'react';
import { name } from '../../utils/name';

const AT_BEGIN_CHAR = '\u0005';
const AT_END_CHAR = '\u0004';

function getName(jid) {
  if (jid === 'all') {
    return 'all';
  } else {
    return name(jid);
  }
}

export default function MessageText({ text }) {
  // 创建匹配标记字符的正则，避免标记字符不是成对出现引起的问题
  // .*? 非贪婪模式，最少匹配
  const regStr = `(${AT_BEGIN_CHAR}@.*?${AT_END_CHAR})`;
  const reg = new RegExp(regStr, 'g');
  const newStr = text.replace(reg, `<span class="at">${'$1'}</span>`);
  const dom = document.createElement('div');
  dom.setAttribute('class', 'msg-text-with-at');
  dom.innerHTML = newStr;
  dom.childNodes.forEach(el => {
    if (el.nodeType === 1) {
      const nodeStr = el.innerHTML;
      // del AT_BEGIN_CHAR、AT_END_CHAR and @
      const jid = nodeStr.slice(2, -1);
      el.innerHTML = getName(jid);
    }
  });
  return <div className="msg-text-with-at" dangerouslySetInnerHTML={{ __html: dom.innerHTML }} />;
}
