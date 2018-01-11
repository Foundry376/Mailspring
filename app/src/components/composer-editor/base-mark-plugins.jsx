import React from 'react';

import {
  BuildToggleButton,
  BuildColorPicker,
  BuildFontPicker,
  hasMark,
} from './toolbar-component-factories';

export const DEFAULT_FONT_SIZE = '11pt';

function isMeaningfulColor(color) {
  const meaningless = ['black', 'rgb(0,0,0)', 'rgba(0,0,0,1)', '#000', '#000000'];
  return color && !meaningless.includes(color.replace(/ /g, ''));
}

function isMeaningfulFontSize(size) {
  return size && sanitizeFontSize(size) !== DEFAULT_FONT_SIZE;
}

function sanitizeFontTagSize(size) {
  return ['6pt', '8pt', DEFAULT_FONT_SIZE, '13pt', '14pt', '18pt', '24pt'][size] || '24pt';
}

function sanitizeFontSize(size) {
  if (size.endsWith('px')) {
    return `${Math.round(size.replace('px', '') / 1 * 0.75)}pt`;
  }
  if (size.endsWith('em')) {
    return `${Math.round(size.replace('em', '') * DEFAULT_FONT_SIZE.replace('pt', ''))}pt`;
  }
  return size;
}

export const MARK_CONFIG = {
  bold: {
    type: 'bold',
    tagNames: ['b', 'strong'],
    hotkey: 'b',
    render: props => <strong>{props.children}</strong>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.bold.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.bold.type),
      iconClass: 'fa fa-bold',
    },
  },
  italic: {
    type: 'italic',
    tagNames: ['em', 'i'],
    hotkey: 'i',
    render: props => <em>{props.children}</em>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.italic.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.italic.type),
      iconClass: 'fa fa-italic',
    },
  },
  underline: {
    type: 'underline',
    tagNames: ['u'],
    hotkey: 'u',
    render: props => <u>{props.children}</u>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.underline.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.underline.type),
      iconClass: 'fa fa-underline',
    },
  },

  strike: {
    type: 'strike',
    tagNames: ['strike', 's', 'del'],
    render: props => <strike>{props.children}</strike>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.strike.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.strike.type),
      iconClass: 'fa fa-strikethrough',
    },
  },

  codeInline: {
    type: 'codeInline',
    tagNames: ['code'],
    render: props => <code>{props.children}</code>,
  },

  color: {
    type: 'color',
    tagNames: [],
    render: ({ children, mark }) => (
      <span style={{ color: mark.data.value || mark.data.get('value') }}>{children}</span>
    ),
  },
  size: {
    type: 'size',
    tagNames: [],
    render: ({ children, mark }) => (
      <span style={{ fontSize: mark.data.value || mark.data.get('value') }}>{children}</span>
    ),
  },
};

function renderMark(props) {
  const config = MARK_CONFIG[props.mark.type];
  return config && config.render(props);
}

function onKeyDown(event, change, editor) {
  if (process.platform === 'darwin' ? event.metaKey : event.ctrlKey) {
    const config = Object.values(MARK_CONFIG).find(({ hotkey }) => event.key === hotkey);
    if (config) {
      change.toggleMark(config.type);
    }
  }
}

const rules = [
  {
    deserialize(el, next) {
      const marks = [];
      const tagName = el.tagName.toLowerCase();
      const config = Object.values(MARK_CONFIG).find(m => m.tagNames.includes(tagName));

      if (config) {
        return {
          object: 'mark',
          type: config.type,
          nodes: next(el.childNodes),
        };
      }
      if (el.style && isMeaningfulColor(el.style.color)) {
        marks.push({
          object: 'mark',
          type: 'color',
          data: { value: el.style.color },
        });
      }
      if (el.style && isMeaningfulFontSize(el.style.fontSize)) {
        marks.push({
          object: 'mark',
          type: 'size',
          data: { value: sanitizeFontSize(el.style.fontSize) },
        });
      }
      if (
        ['font', 'p', 'div', 'span'].includes(tagName) &&
        isMeaningfulColor(el.getAttribute('color'))
      ) {
        marks.push({
          object: 'mark',
          type: 'color',
          data: { value: el.getAttribute('color') },
        });
      }
      if (tagName === 'font' && el.getAttribute('size')) {
        const size = sanitizeFontTagSize(el.getAttribute('size'));
        if (isMeaningfulFontSize(size)) {
          marks.push({
            object: 'mark',
            type: 'size',
            data: { value: size },
          });
        }
      }

      if (marks.length) {
        const root = marks[0];
        let tail = root;
        for (let x = 1; x < marks.length; x++) {
          tail.nodes = [marks[x]];
          tail = tail.nodes[0];
        }
        tail.nodes = next(el.childNodes);
        return root;
      }
    },
    serialize(obj, children) {
      if (obj.object !== 'mark') return;
      return renderMark({ mark: obj, children, targetIsHTML: true });
    },
  },
];

export default [
  {
    toolbarComponents: Object.values(MARK_CONFIG)
      .filter(m => m.button)
      .map(BuildToggleButton)
      .concat([
        BuildColorPicker({ type: 'color', default: '#000000' }),
        BuildFontPicker({ type: 'size', default: DEFAULT_FONT_SIZE }),
      ]),
    renderMark,
    onKeyDown,
    rules,
  },
];
