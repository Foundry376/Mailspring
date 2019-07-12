import React from 'react';

import {
  BuildToggleButton,
  BuildColorPicker,
  BuildFontPicker,
  BuildFontSizePicker,
  hasMark,
} from './toolbar-component-factories';

import BaseBlockPlugins from './base-block-plugins';

export const DEFAULT_FONT_SIZE = 2;
export const DEFAULT_FONT_OPTIONS = [
  { name: 'Small', value: 1 },
  { name: 'Normal', value: 2 },
  { name: 'Large', value: 4 },
  { name: 'Huge', value: 6 },
];

export const DEFAULT_FONT_FACE = 'sans-serif';
export const DEFAULT_FONT_FACE_OPTIONS = [
  { name: 'Sans Serif', value: 'sans-serif' },
  { name: 'Serif', value: 'serif' },
  { name: 'Fixed Width', value: 'monospace' },
  { name: 'Comic Sans MS', value: 'comic sans ms' },
  { name: 'Garamond', value: 'garamond' },
  { name: 'Georgia', value: 'georgia' },
  { name: 'Tahoma', value: 'tahoma' },
  { name: 'Trebuchet MS', value: 'trebuchet ms' },
  { name: 'Verdana', value: 'verdana' },
];

const PT_TO_SIZE = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 3, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 7];

let plugins = null;
export const Divider = (key = 'divider') => (
  <div className="divider " key={key} />
);
Divider.displayName = 'Divider';

function isMeaningfulColor(color) {
  const meaningless = ['black', 'rgb(0,0,0)', 'rgba(0,0,0,1)', '#000', '#000000'];
  return color && !meaningless.includes(color.replace(/ /g, ''));
}

function isMeaningfulFontSize(size) {
  return size && size / 1 !== DEFAULT_FONT_SIZE;
}

function isMeaningfulFontStyle(style) {
  return style && style !== '14px';
}

export const MARK_CONFIG = {
  bold: {
    type: 'bold',
    tagNames: ['b', 'strong'],
    render: props => <strong>{props.children}</strong>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.bold.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.bold.type),
      iconClass: 'dt-icon dt-icon-bold',
    },
  },
  italic: {
    type: 'italic',
    tagNames: ['em', 'i'],
    render: props => <em>{props.children}</em>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.italic.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.italic.type),
      iconClass: 'dt-icon dt-icon-italic',
    },
  },
  underline: {
    type: 'underline',
    tagNames: ['u'],
    render: props => <u>{props.children}</u>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.underline.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.underline.type),
      iconClass: 'dt-icon dt-icon-underline',
    },
  },

  strike: {
    type: 'strike',
    tagNames: ['strike', 's', 'del'],
    render: props => <strike>{props.children}</strike>,
    button: {
      isActive: value => hasMark(value, MARK_CONFIG.strike.type),
      onToggle: value => value.change().toggleMark(MARK_CONFIG.strike.type),
      iconClass: 'dt-icon dt-icon-strikethrough',
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
    render: ({ children, mark, targetIsHTML }) => {
      let v = mark.data.value || mark.data.get('value');

      // we don't apply any font size if the font size is the default value,
      // so other clients also show it in their default size of choice.
      if (v === DEFAULT_FONT_SIZE) {
        v = undefined;
      }
      return typeof v === 'string' ? (
        <font style={{ fontSize: v }}>{children}</font>
      ) : (
          <font size={v}>{children}</font>
        );
    },
  },
  face: {
    type: 'face',
    tagNames: [],
    render: ({ children, mark }) => (
      <font style={{ fontFamily: mark.data.value || mark.data.get('value') }}>{children}</font>
    ),
  },
};

function renderMark(props) {
  const config = MARK_CONFIG[props.mark.type];
  return config && config.render(props);
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
      if (el.style && isMeaningfulFontStyle(el.style.fontSize)) {
        marks.push({
          object: 'mark',
          type: 'size',
          data: { value: el.style.fontSize },
        });
      }
      if (el.style && el.style.fontFamily) {
        marks.push({
          object: 'mark',
          type: 'face',
          data: { value: el.style.fontFamily },
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
        const size = Math.max(1, Math.min(6, el.getAttribute('size') / 1));
        if (isMeaningfulFontSize(size)) {
          marks.push({
            object: 'mark',
            type: 'size',
            data: { value: size },
          });
        }
      }
      if (tagName === 'font' && el.getAttribute('face')) {
        marks.push({
          object: 'mark',
          type: 'face',
          data: { value: el.getAttribute('face') },
        });
      }

      if (marks.length) {
        // we are going to return a value! This means other plugins won't
        // have a chance to execute on this node in the DOM. But we may want
        // plugins (eg link-plugin), to add more marks. Manually run them
        // and collect any additional marks:
        plugins = plugins || require('./conversion').plugins;
        const subsequentPlugins = plugins.slice(plugins.findIndex(p => p.rules === rules) + 1);
        for (const p of subsequentPlugins) {
          for (const { deserialize } of p.rules || []) {
            const result = deserialize && deserialize(el, () => []);
            if (result && result.object === 'mark') {
              if (result.object.nodes && result.object.nodes.length) {
                console.warn(
                  'base-mark-plugin does not look at nested marks from subsequent plugins'
                );
              }
              marks.push(result);
            }
          }
        }

        // convert array of marks into a tree. If the marks are on a BLOCK
        // tagname, also nest the marks within the block node that would
        // have been created, since the block will not be created if we return
        // a value.
        let block = null;
        for (const plugin of BaseBlockPlugins) {
          if (block) break;
          if (!plugin.rules) continue;
          for (const { deserialize } of plugin.rules) {
            block = deserialize(el, next);
            if (block) {
              break;
            }
          }
        }
        const root = marks[0];
        let tail = root;
        for (let x = 1; x < marks.length; x++) {
          tail.nodes = [marks[x]];
          tail = tail.nodes[0];
        }
        tail.nodes = block ? [block] : next(el.childNodes);
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
        Divider,
        BuildFontPicker({
          type: 'face',
          default: DEFAULT_FONT_FACE,
          options: DEFAULT_FONT_FACE_OPTIONS,
          convert: provided => {
            let opt = null;
            let score = 10000;
            for (const aopt of DEFAULT_FONT_FACE_OPTIONS) {
              const i = provided.toLowerCase().indexOf(aopt.value);
              if (i >= 0 && i < score) {
                score = i;
                opt = aopt;
              }
            }
            return opt ? opt.value : 'sans-serif';
          },
        }),
        Divider,
        BuildFontSizePicker({
          type: 'size',
          iconClass: 'dt-icon dt-icon-font-size',
          default: DEFAULT_FONT_SIZE,
          options: DEFAULT_FONT_OPTIONS,
          convert: provided => {
            if (typeof provided === 'string') {
              let size = 2;
              if (provided.endsWith('px')) {
                // 16px = 12pt
                size = PT_TO_SIZE[Math.round(provided.replace('px', '') / 1 * 0.75)];
              }
              if (provided.endsWith('em')) {
                // 1em = 12pt
                size = PT_TO_SIZE[Math.round(provided.replace('em', '') * 12)];
              }
              if (provided.endsWith('pt')) {
                size = PT_TO_SIZE[Math.round(provided.replace('pt', '') * 1)];
              }
              const opt = DEFAULT_FONT_OPTIONS.find(({ value }) => value >= size);
              return opt ? opt.value : 2;
            }
            return provided;
          },
        }),
      ]),
    renderMark,
    commands: {
      'contenteditable:bold': (event, value) => value.change().toggleMark(MARK_CONFIG.bold.type),
      'contenteditable:underline': (event, value) =>
        value.change().toggleMark(MARK_CONFIG.underline.type),
      'contenteditable:italic': (event, value) =>
        value.change().toggleMark(MARK_CONFIG.italic.type),
    },
    rules,
  },
];
