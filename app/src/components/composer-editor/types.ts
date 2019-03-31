import { Node, Editor, Value, Mark } from 'slate';

export interface Rule {
  deserialize?: (
    el: Element,
    next: (elements: Element[] | NodeList | Array<Node & ChildNode>) => any
  ) => any;
  serialize?: (obj: any, children: string) => React.ReactNode | void;
}

export interface ComposerEditorPlugin {
  renderMark?: (
    { mark, children, targetIsHTML }: { mark: Mark; children: any; targetIsHTML: boolean },
    editor: Editor | null,
    next: () => void
  ) => void | string | JSX.Element;

  renderNode?: (
    props: { node: Node; children: any; targetIsHTML: boolean },
    editor: Editor | null,
    next: () => void
  ) => void | JSX.Element;

  rules?: Rule[];

  topLevelComponent?: React.ComponentType<ComposerEditorPluginTopLevelComponentProps>;
  toolbarComponents?: React.ComponentType<ComposerEditorPluginToolbarComponentProps>[];
  toolbarSectionClass?: string;

  commands?: { [command: string]: (event: any, editor: Editor) => void };
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
