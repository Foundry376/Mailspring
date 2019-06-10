import { Node, Editor, Value, Mark, Block, Inline } from 'slate';

export interface Rule {
  deserialize?: (
    el: Element,
    next: (elements: Element[] | NodeList | Array<Node & ChildNode>) => any
  ) => any;
  serialize?: (obj: any, children: string) => React.ReactNode | void;
}

export interface ComposerEditorPlugin {
  renderMark?: (
    { mark, children, targetIsHTML }: { mark: Mark; children: any; targetIsHTML?: boolean },
    editor: Editor | null,
    next: () => void
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

  commands?: { [command: string]: (event: any, editor: Editor) => Editor };

  onChange?(editor: Editor, next: () => void);
  onPaste?: (event, editor: Editor, next: () => void) => void;
  onKeyDown?: (event, editor: Editor, next: () => void) => void;
  onKeyUp?: (event, editor: Editor, next: () => void) => void;
  onClick?: (event, editor: Editor, next: () => void) => void;
  onCompositionStart?: (event, editor: Editor, next: () => void) => void;
  onCompositionEnd?: (event, editor: Editor, next: () => void) => void;
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
