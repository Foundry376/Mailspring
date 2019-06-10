import React from 'react';
import SlateTypes from 'slate-prop-types';
import Types from 'prop-types';
import invariant from 'tiny-invariant';
import { Editor as Controller, Value } from 'slate';

const EVENT_HANDLERS = [
  'onBeforeInput',
  'onBlur',
  'onClick',
  'onContextMenu',
  'onCompositionEnd',
  'onCompositionStart',
  'onCopy',
  'onCut',
  'onDragEnd',
  'onDragEnter',
  'onDragExit',
  'onDragLeave',
  'onDragOver',
  'onDragStart',
  'onDrop',
  'onInput',
  'onFocus',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseUp',
  'onPaste',
  'onSelect',
];
/**
 * Editor.
 *
 * @type {Component}
 */

interface Props {
  autoCorrect?: boolean;
  className: string;
  id: string;
  onChange?: any;
  readOnly?: boolean;
  role: string;
  spellCheck?: boolean;
  style: object;
  tabIndex: number;
  controller: Controller;
  onBlur?: (e: Event) => void;
  onDrop?: (e: Event) => void;
  onCut?: (e: Event) => void;
  onCopy?: (e: Event) => void;
  onPaste?: (e: Event) => void;
}

export class SlateEditor extends React.Component<Props> {
  /**
   * Property types.
   *
   * @type {Object}
   */

  static propTypes = {
    autoCorrect: Types.bool,
    className: Types.string,
    id: Types.string,
    onChange: Types.func,
    readOnly: Types.bool,
    role: Types.string,
    spellCheck: Types.bool,
    style: Types.object,
    tabIndex: Types.number,
    value: SlateTypes.value,
    ...EVENT_HANDLERS.reduce((obj, handler) => {
      obj[handler] = Types.func;
      return obj;
    }, {}),
  };

  /**
   * Default properties.
   *
   * @type {Object}
   */

  static defaultProps = {
    autoCorrect: true,
    onChange: () => {},
    readOnly: false,
    spellCheck: true,
  };

  /**
   * Render the editor.
   *
   * @return {Element}
   */

  render() {
    // Set the current props on the controller.
    const { controller, ...rest } = this.props;

    // Render the editor's children with the controller.
    return controller.run('renderEditor', {
      ...rest,
      editor: this,
      value: controller.value,
    });
  }

  /**
   * Mimic the API of the `Editor` controller, so that this component instance
   * can be passed in its place to plugins.
   */

  get controller(): Controller {
    return this.props.controller;
  }

  get operations() {
    return this.controller.operations;
  }

  get readOnly() {
    return this.controller.readOnly;
  }

  get value() {
    return this.controller.value;
  }

  applyOperation(...args) {
    return this.controller.applyOperation(...args);
  }

  command(...args) {
    return this.controller.command(...args);
  }

  hasCommand(...args) {
    return this.controller.hasCommand(...args);
  }

  hasQuery(...args) {
    return this.controller.hasQuery(...args);
  }

  normalize(...args) {
    return this.controller.normalize(...args);
  }

  query(...args) {
    return this.controller.query(...args);
  }

  registerCommand(...args) {
    return this.controller.registerCommand(...args);
  }

  registerQuery(...args) {
    return this.controller.registerQuery(...args);
  }

  run(...args) {
    return this.controller.run(...args);
  }

  withoutNormalizing(...args) {
    return this.controller.withoutNormalizing(...args);
  }

  /**
   * Deprecated.
   */

  get editor() {
    return this.controller.editor;
  }

  get stack() {
    invariant(
      false,
      'As of Slate 0.42, the `editor.stack` property no longer exists, and its functionality has been folded into the editor itself. Use the `editor` instead.'
    );
  }

  call(...args) {
    return this.controller.call(...args);
  }

  change(...args) {
    return this.controller.change(...args);
  }

  onChange(...args) {
    return this.controller.onChange(...args);
  }

  applyOperations(...args) {
    return this.controller.applyOperations(...args);
  }

  setOperationFlag(...args) {
    return this.controller.setOperationFlag(...args);
  }

  getFlag(...args) {
    return this.controller.getFlag(...args);
  }

  unsetOperationFlag(...args) {
    return this.controller.unsetOperationFlag(...args);
  }

  withoutNormalization(...args) {
    return this.controller.withoutNormalization(...args);
  }
}
