import { Node, Editor, Value, Mark, Block, Inline } from 'slate';
import { Plugin, RenderMarkProps } from 'slate-react';

export interface Rule {
  deserialize?: (
    el: Element,
    next: (elements: Element[] | NodeList | Array<Node & ChildNode>) => any
  ) => any;
  serialize?: (obj: any, children: string) => React.ReactNode | void;
}

export interface ComposerEditorPlugin extends Omit<Plugin<Editor>, 'onKeyDown'> {
  renderMark?: (
    { mark, children, targetIsHTML }: RenderMarkProps & { targetIsHTML?: boolean },
    editor?: Editor,
    next?: () => void
  ) => void | string | JSX.Element;

  renderNode?: (
    props: { node: Block | Inline; children: any; targetIsHTML: boolean },
    editor: Editor | null,
    next: () => void
  ) => void | JSX.Element;

  rules?: Rule[];

  topLevelComponent?: React.ComponentType<ComposerEditorPluginTopLevelComponentProps>;
  toolbarComponents?: React.ComponentType<ComposerEditorPluginToolbarComponentProps>[];
  toolbarSectionClass?: string;

  appCommands?: { [command: string]: (event: CustomEvent, editor: Editor) => Editor };

  onChange?(editor: Editor, next: () => void);
  onKeyDown?: (event: React.KeyboardEvent, editor: Editor, next: () => void) => void;
  onKeyUp?: (event: React.KeyboardEvent, editor: Editor, next: () => void) => void;
}

export interface ComposerEditorPluginToolbarComponentProps {
  editor: Editor;
  value: Value;
  className: string;
}

export interface ComposerEditorPluginTopLevelComponentProps {
  editor: Editor;
  value: Value;
}
