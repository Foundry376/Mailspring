export const ZERO_WIDTH_SPACE = '\u200B';
export const SOFT_NEWLINE = '\n\u200B';
export const DEFAULT_LINE_WIDTH = 72;

// Given a string with the `> `, `>> ` quote syntax, prepends each
// line with another `>`, adding a trailing space only after the last `>`
export function deepenPlaintextQuote(text: string) {
  return `\n${text}`.replace(/(\n>*) ?/g, '$1> ');
}

// Forcibly wrap lines to 72 characters, inserting special "soft" newlines that
// subsequent calls to `wrapPlaintext` can remove and re-wrap.

export function wrapPlaintext(text: string, lineWidth: number = DEFAULT_LINE_WIDTH) {
  return wrapPlaintextWithSelection({ value: text, selectionStart: 0, selectionEnd: 0 }, lineWidth)
    .value;
}

// Our editor uses zero-width spaces to differentiate between soft and hard newlines
// when you're editing. The newlines it automatically inserts when you hit the line
// width are followed by a ZWS, and it knows that it can subsequently treat these as
// spaces and not newlines when it re-runs the wrap algorithm.

export function wrapPlaintextWithSelection(
  {
    selectionStart,
    selectionEnd,
    value,
  }: { selectionStart: number; selectionEnd: number; value: string },
  lineWidth: number = DEFAULT_LINE_WIDTH
) {
  let result = '';
  let resultSelectionStart = undefined;
  let resultSelectionEnd = undefined;
  let resultLineLength = 0;
  let word = '';
  let valueOffset = 0;

  const flushWord = () => {
    if (resultLineLength + word.length > lineWidth) {
      const line = result.substr(result.length - resultLineLength);
      const lineQuotePrefixMatch = !word.startsWith('>') && /^>+ /.exec(line);
      const lineQuotePrefix = lineQuotePrefixMatch ? lineQuotePrefixMatch[0] : '';

      const newLine = lineQuotePrefix + word.trim();

      if (
        resultSelectionStart > result.length &&
        resultSelectionStart <= result.length + word.length
      ) {
        resultSelectionStart += SOFT_NEWLINE.length + newLine.length - word.length;
      }
      if (resultSelectionEnd > result.length && resultSelectionEnd <= result.length + word.length) {
        resultSelectionEnd += SOFT_NEWLINE.length + newLine.length - word.length;
      }
      result += SOFT_NEWLINE + newLine;
      resultLineLength = newLine.length;
    } else {
      result += word;
      resultLineLength += word.length;
    }
    word = '';
  };

  const setMarksIfPastSelection = () => {
    if (resultSelectionStart === undefined && selectionStart <= valueOffset) {
      resultSelectionStart = result.length + word.length;
    }
    if (resultSelectionEnd === undefined && selectionEnd <= valueOffset) {
      resultSelectionEnd = result.length + word.length;
    }
  };

  while (valueOffset < value.length) {
    let char = value[valueOffset];
    setMarksIfPastSelection();

    if (char === '\n' && value[valueOffset + 1] === ZERO_WIDTH_SPACE) {
      char = ' ';
    }
    if (char === ZERO_WIDTH_SPACE) {
      while (value[valueOffset + 1] === '>') {
        valueOffset += 1;
      }
      if (value[valueOffset + 1] === ' ') {
        valueOffset += 1;
      }
      // no-op
    } else if (char === '\n') {
      result += word;
      result += '\n';
      resultLineLength = 0;
      word = '';
    } else if (char === ' ') {
      flushWord();
      word += char;
    } else {
      word += char;
    }

    valueOffset += 1;
  }

  flushWord();
  setMarksIfPastSelection();

  return {
    value: result,
    selectionStart: resultSelectionStart,
    selectionEnd: resultSelectionEnd,
  };
}

export function convertPlaintextToHTML(plain: string) {
  const div = document.createElement('div');
  div.innerText = plain;
  div.style.whiteSpace = 'pre-wrap';
  return div.outerHTML;
}
