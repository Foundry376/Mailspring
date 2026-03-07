# Creating Composer Plugins

This guide covers how to build plugins that extend the Mailspring composer — the email drafting interface. Composer plugins can add toolbar buttons, modify draft content, inject UI components, extend the Slate rich-text editor, and hook into the send lifecycle.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Plugin File Structure](#plugin-file-structure)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Adding UI to the Composer](#adding-ui-to-the-composer)
  - [Component Roles](#component-roles)
  - [Props Available to Injected Components](#props-available-to-injected-components)
  - [Toolbar Buttons (Composer:ActionButton)](#toolbar-buttons-composeractionbutton)
  - [Footer Components (Composer:Footer)](#footer-components-composerfooter)
- [Modifying Draft Content](#modifying-draft-content)
  - [Using the DraftEditingSession](#using-the-drafteditigsession)
  - [Working with Plugin Metadata](#working-with-plugin-metadata)
- [ComposerExtension: Draft Lifecycle Hooks](#composerextension-draft-lifecycle-hooks)
  - [prepareNewDraft](#preparenewdraft)
  - [warningsForSending](#warningsforsending)
  - [applyTransformsForSending](#applytransformsforsending)
  - [sendActions](#sendactions)
- [Extending the Slate Rich-Text Editor](#extending-the-slate-rich-text-editor)
  - [Editor Plugin Architecture](#editor-plugin-architecture)
  - [The ComposerEditorPlugin Interface](#the-composereditorplugin-interface)
  - [Rendering Custom Nodes (Void Inlines)](#rendering-custom-nodes-void-inlines)
  - [HTML Serialization and Deserialization Rules](#html-serialization-and-deserialization-rules)
  - [Handling Keyboard Events](#handling-keyboard-events)
  - [Adding Editor Toolbar Buttons](#adding-editor-toolbar-buttons)
  - [Top-Level Components (Floating UI)](#top-level-components-floating-ui)
  - [Marks for Transient State](#marks-for-transient-state)
  - [Registering Your Editor Plugin](#registering-your-editor-plugin)
- [Complete Examples](#complete-examples)
  - [Example 1: Simple Composer Action Button (Translation)](#example-1-simple-composer-action-button-translation)
  - [Example 2: Full Composer Plugin with Editor Extension (Templates)](#example-2-full-composer-plugin-with-editor-extension-templates)
  - [Example 3: Inline Autocomplete with Floating UI (Emoji)](#example-3-inline-autocomplete-with-floating-ui-emoji)
- [Key Imports Reference](#key-imports-reference)
- [Design Patterns and Best Practices](#design-patterns-and-best-practices)

---

## Architecture Overview

The Mailspring composer is built on several layers:

```
┌──────────────────────────────────────────────────────────┐
│  Composer:ActionButton   Composer:Footer   ...           │  ← Injected via ComponentRegistry
├──────────────────────────────────────────────────────────┤
│  ComposerView  (app/internal_packages/composer/)         │  ← Renders InjectedComponentSets
├──────────────────────────────────────────────────────────┤
│  ComposerEditor (Slate v0 rich-text editor)              │  ← Slate plugins for editor behavior
├──────────────────────────────────────────────────────────┤
│  DraftEditingSession  /  DraftChangeSet                  │  ← Draft state management
├──────────────────────────────────────────────────────────┤
│  ComposerExtension (ExtensionRegistry.Composer)          │  ← Send lifecycle hooks
└──────────────────────────────────────────────────────────┘
```

There are three distinct plugin systems at play:

1. **ComponentRegistry** — Injects React components into named slots (roles) in the composer UI.
2. **ExtensionRegistry.Composer** — Registers `ComposerExtension` subclasses that hook into draft creation, validation, and sending.
3. **Slate Editor Plugins** — Extend the rich-text editor with custom nodes, marks, keyboard handling, toolbar buttons, and floating UI.

Most composer plugins use (1) and (2). Plugins that need to introduce new inline content types in the editor body (like template variables or emoji) also use (3).

---

## Plugin File Structure

```
app/internal_packages/my-composer-plugin/
├── package.json
├── lib/
│   ├── main.ts              # activate() / deactivate() lifecycle
│   ├── my-button.tsx         # React component for Composer:ActionButton
│   ├── my-extension.ts       # ComposerExtension subclass (optional)
│   └── my-editor-plugin.tsx  # Slate editor plugin (optional)
├── assets/
│   └── icon-my-plugin@2x.png
└── styles/
    └── my-plugin.less
```

### package.json

```json
{
  "name": "my-composer-plugin",
  "version": "0.1.0",
  "main": "./lib/main",
  "title": "My Plugin",
  "description": "Does something useful in the composer.",
  "icon": "./icon.png",
  "license": "GPL-3.0",
  "private": true,
  "isOptional": true,
  "engines": {
    "mailspring": "*"
  },
  "windowTypes": {
    "default": true,
    "composer": true,
    "thread-popout": true
  }
}
```

**`windowTypes`** controls which Electron windows load the plugin:
- `default` — Main application window
- `composer` — Composer popout window
- `thread-popout` — Thread popout window

Most composer plugins should set all three to `true`.

---

## Plugin Lifecycle

Every plugin must export `activate()` and `deactivate()` from `lib/main.ts`:

```typescript
import { ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
import MyButton from './my-button';
import MyComposerExtension from './my-extension';

export function activate() {
  ComponentRegistry.register(MyButton, { role: 'Composer:ActionButton' });
  ExtensionRegistry.Composer.register(MyComposerExtension);
}

export function deactivate() {
  ComponentRegistry.unregister(MyButton);
  ExtensionRegistry.Composer.unregister(MyComposerExtension);
}
```

`activate()` is called when the plugin is enabled (on startup for built-in plugins). `deactivate()` is called when disabled. Always unregister everything you registered.

---

## Adding UI to the Composer

### Component Roles

The composer renders `InjectedComponentSet` elements at specific named slots called **roles**. Your plugin registers React components into these roles via `ComponentRegistry.register()`.

| Role | Location | Description |
|------|----------|-------------|
| `Composer:ActionButton` | Toolbar above the editor | Buttons like Translate, Templates, Send Later |
| `Composer:Footer` | Below the editor body | Status bars, informational messages |
| `Composer:ActionBarWorkspace` | Below the action bar | Extended workspace area |
| `Composer:FromFieldComponents` | In the "From" row | Signature picker, account-related UI |

### Props Available to Injected Components

Components registered with a `Composer:*` role receive these props automatically:

```typescript
interface ComposerInjectedProps {
  draft: Message;                    // The current draft object
  session: DraftEditingSession;      // Session for applying changes
  headerMessageId: string;           // Unique ID for this draft
  threadId: string;                  // Thread ID (for replies)
  isValidDraft: () => boolean;       // Validates draft before sending
}
```

Source: `app/internal_packages/composer/lib/composer-view.tsx`

### Toolbar Buttons (Composer:ActionButton)

The most common extension point. Your component renders a button in the composer toolbar.

```typescript
// lib/my-button.tsx
import React from 'react';
import ReactDOM from 'react-dom';
import { PropTypes, Actions, Message, DraftEditingSession, localized } from 'mailspring-exports';
import { RetinaImg, Menu } from 'mailspring-component-kit';

export default class MyComposerButton extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  static displayName = 'MyComposerButton';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  shouldComponentUpdate(nextProps) {
    // The draft changes on every keystroke. Only re-render when
    // something relevant to your button changes.
    return nextProps.session !== this.props.session;
  }

  _onClick = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(
      <MyPopoverContent
        draft={this.props.draft}
        session={this.props.session}
      />,
      { originRect: buttonRect, direction: 'up' }
    );
  };

  render() {
    // Hide in plaintext mode if your plugin only works with HTML
    if (this.props.draft.plaintext) {
      return <span />;
    }
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar narrow pull-right"
        onClick={this._onClick}
        title={localized('My Plugin')}
      >
        <RetinaImg
          url="mailspring://my-composer-plugin/assets/icon@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }
}
```

Key conventions:
- Always set `static displayName` — required by `ComponentRegistry`.
- Use `tabIndex={-1}` on buttons to avoid stealing focus from the editor.
- Use `shouldComponentUpdate` to avoid re-rendering on every keystroke.
- Use `Actions.openPopover()` for dropdown menus, passing `direction: 'up'` since the toolbar is at the bottom of the composer.
- Use `RetinaImg` with `ContentIsMask` mode for icons that match the theme.

### Footer Components (Composer:Footer)

Footer components appear below the editor body. Used for status messages.

```typescript
// lib/my-status-bar.tsx
import React from 'react';
import { Message, MessageWithEditorState } from 'mailspring-exports';

export default class MyStatusBar extends React.Component<{
  draft: MessageWithEditorState;
}> {
  static displayName = 'MyStatusBar';

  static containerStyles = {
    textAlign: 'center' as const,
    width: 580,
    margin: 'auto',
  };

  render() {
    // Conditionally render based on draft state
    if (!this._shouldShow(this.props.draft)) {
      return <div />;
    }
    return (
      <div className="my-status-bar">
        Some informational message for the user.
      </div>
    );
  }
}
```

The templates plugin uses this to display "Press tab to move between blanks" when a template with variables is active. It reads the Slate editor state via `draft.bodyEditorState`:

```typescript
_usingTemplate(draft: MessageWithEditorState) {
  return (
    draft.bodyEditorState &&
    draft.bodyEditorState.document.getInlinesByType('templatevar').size > 0
  );
}
```

---

## Modifying Draft Content

### Using the DraftEditingSession

The `session` prop provides the primary API for modifying drafts:

```typescript
// Replace the entire body
session.changes.add({ body: '<div>New content</div>' });

// Change other draft fields
session.changes.add({ subject: 'New Subject' });
session.changes.add({ to: [new Contact({ email: 'a@b.com', name: 'Alice' })] });

// Commit changes immediately (otherwise debounced ~10s)
session.changes.commit();
```

`session.changes.add()` accepts a partial `Message` object. Changes are batched and debounced — multiple rapid calls are coalesced into a single database write.

**Body synchronization**: When you write to `body` (an HTML string), the system automatically converts it to a Slate `Value` for the editor via `convertFromHTML()`. If the editor is mounted, the conversion preserves undo history by using Slate's `replaceNodeByKey` and `insertFragment` operations.

Source: `app/src/flux/stores/draft-editing-session.ts`, `app/src/flux/stores/draft-change-set.ts`

### Working with Plugin Metadata

Drafts support arbitrary key-value metadata per plugin, persisted alongside the draft:

```typescript
// Read metadata
const metadata = draft.metadataForPluginId('my-plugin');

// Write metadata (on the session)
session.changes.addPluginMetadata('my-plugin', {
  enabled: true,
  setting: 'value',
});
```

This is useful for tracking plugin state (e.g., "link tracking is enabled for this draft").

---

## ComposerExtension: Draft Lifecycle Hooks

`ComposerExtension` provides static hooks into the draft lifecycle. Subclass it and register via `ExtensionRegistry.Composer.register()`.

Source: `app/src/extensions/composer-extension.ts`

### prepareNewDraft

Called once when a brand-new draft is created, before it's displayed:

```typescript
import { ComposerExtension, Message } from 'mailspring-exports';

export default class MyExtension extends ComposerExtension {
  static prepareNewDraft({ draft }: { draft: Message }) {
    // Modify the draft directly here - this is one of the few
    // places where direct mutation is safe.
    draft.body = draft.body + '<div>-- Sent from My Plugin</div>';

    // Set pristine = false if your changes make the draft
    // "valuable" (so it won't be auto-discarded)
    draft.pristine = false;
  }
}
```

### warningsForSending

Return warning phrases displayed in a confirmation dialog before sending:

```typescript
static warningsForSending({ draft }: { draft: Message }): string[] {
  const warnings = [];
  if (draft.body.includes('<code class="var">')) {
    warnings.push('with unfilled template variables');
  }
  if (!draft.subject) {
    warnings.push('without a subject');
  }
  return warnings;
  // Displayed as: "Send with unfilled template variables and without a subject?"
}
```

### applyTransformsForSending

Transform the draft body just before it's sent. Must be reversible.

```typescript
static applyTransformsForSending({
  draft,
  draftBodyRootNode,  // HTMLElement - only for HTML messages
  recipient,          // Contact - for per-recipient body variants
}: {
  draft: Message;
  draftBodyRootNode?: HTMLElement;
  recipient?: Contact;
}) {
  if (draft.plaintext) return;
  const metadata = draft.metadataForPluginId('my-tracking');
  if (!metadata) return;

  // Insert a tracking pixel
  const img = document.createElement('img');
  img.src = `https://track.example.com/open/${draft.headerMessageId}`;
  img.className = 'my-tracking-pixel';
  draftBodyRootNode.appendChild(img);
}
```

### sendActions

Register custom send actions that appear in the send button dropdown:

```typescript
static sendActions() {
  return [{
    title: 'Send Later',
    iconUrl: 'mailspring://send-later/assets/icon-send-later@2x.png',
    isAvailableForDraft: ({ draft }) => true,
    performSendAction: ({ draft }) => {
      // Custom send logic
    },
  }];
}
```

---

## Extending the Slate Rich-Text Editor

This is the most powerful and complex extension point. The composer uses **Slate v0** as its rich-text editor framework. Slate plugins can introduce custom inline node types, marks, keyboard shortcuts, toolbar buttons, and floating UI.

### Editor Plugin Architecture

The editor loads plugins from `app/src/components/composer-editor/conversion.tsx`:

```typescript
export const plugins: ComposerEditorPlugin[] = [
  ...InlineAttachmentPlugins,  // Inline images
  ...UneditablePlugins,        // Quoted text, tables, signatures
  ...BaseMarkPlugins,          // Bold, italic, underline, etc.
  ...TemplatePlugins,          // Template variables
  ...EmojiPlugins,             // Emoji insertion
  ...LinkPlugins,              // Hyperlinks
  ...BaseBlockPlugins,         // Blockquote, code blocks
  ...MarkdownPlugins,          // Markdown shortcuts
];
```

**Order matters**: Deserialization rules are applied in this order. More specific rules (template `<span data-tvar>`) must come before generic ones (plain `<div>`).

The schema defines which node types are void (non-editable):

```typescript
export const schema = {
  inlines: {
    templatevar: { isVoid: true },
    emoji:       { isVoid: true },
    image:       { isVoid: true },
    uneditable:  { isVoid: true },
  },
  blocks: {
    uneditable:  { isVoid: true },
  },
};
```

### The ComposerEditorPlugin Interface

Source: `app/src/components/composer-editor/types.ts`

```typescript
interface ComposerEditorPlugin {
  // --- Rendering ---
  renderNode?: (
    props: { node: Block | Inline; children: any; targetIsHTML: boolean;
             attributes?: any; isSelected?: boolean },
    editor: Editor | null,
    next: () => void
  ) => void | JSX.Element;

  renderMark?: (
    props: RenderMarkProps & { targetIsHTML?: boolean },
    editor?: Editor,
    next?: () => void
  ) => void | string | JSX.Element;

  // --- HTML Serialization ---
  rules?: Rule[];   // { deserialize(el, next), serialize(obj, children) }

  // --- Keyboard Events ---
  onKeyDown?: (event: React.KeyboardEvent, editor: Editor, next: () => void) => void;
  onKeyUp?: (event: React.KeyboardEvent, editor: Editor, next: () => void) => void;
  onChange?(editor: Editor, next: () => void);

  // --- UI Components ---
  toolbarComponents?: React.ComponentType<{
    editor: Editor; value: Value; className: string;
  }>[];
  toolbarSectionClass?: string;
  topLevelComponent?: React.ComponentType<{ editor: Editor; value: Value }>;

  // --- Application Commands ---
  appCommands?: { [command: string]: (event: CustomEvent, editor: Editor) => Editor };
}
```

Each handler receives a `next` function. Call `next()` to pass control to the next plugin in the chain. If your plugin handles the event, return without calling `next()`.

### Rendering Custom Nodes (Void Inlines)

To display custom inline elements in the editor, define a `renderNode` function. The `targetIsHTML` flag lets you render differently for the editor UI vs. the serialized HTML email:

```typescript
export const MY_TYPE = 'mycustomnode';

function renderNode({ node, attributes, children, isSelected, targetIsHTML }, editor, next) {
  if (node.type !== MY_TYPE) return next();

  const name = node.data.get('name');

  if (targetIsHTML) {
    // This JSX becomes the HTML that's saved and sent
    return <span data-my-type={name}>{name}</span>;
  }

  // This JSX is the interactive UI in the editor
  return (
    <span
      {...attributes}
      data-my-type={name}
      className={`my-node ${isSelected ? 'selected' : ''}`}
      contentEditable={false}
    >
      {name}
    </span>
  );
}
```

Template variables use this pattern — they render as `<span data-tvar="name">` in HTML but as styled, non-editable pill elements in the editor:

```typescript
// From template-plugins.tsx
return (
  <span
    {...attributes}
    data-tvar={name}
    className={`template-variable ${isSelected && 'selected'}`}
    contentEditable={false}
    title={name}
  >
    {name}
  </span>
);
```

### HTML Serialization and Deserialization Rules

Rules define how your custom nodes convert to/from HTML. This is critical because drafts are stored as HTML strings and loaded into the Slate editor on open.

```typescript
const rules: Rule[] = [
  {
    // HTML Element → Slate Node (when loading a draft)
    deserialize(el: Element, next) {
      // Check if this HTML element is one of ours
      if (el.dataset && el.dataset.myType) {
        return {
          object: 'inline',
          type: MY_TYPE,
          data: { name: el.dataset.myType },
        };
      }
      // Return nothing to let other plugins handle this element
    },

    // Slate Node → HTML (when saving/sending a draft)
    serialize(obj, children) {
      if (obj.object !== 'inline' || obj.type !== MY_TYPE) return;
      // Reuse renderNode with targetIsHTML: true
      return renderNode({ node: obj, children, targetIsHTML: true });
    },
  },
];
```

The template plugin also supports a legacy format by checking for `<code class="var">`:

```typescript
deserialize(el, next) {
  let name = el.dataset && el.dataset.tvar;
  if (el.tagName === 'CODE' && el.classList.contains('var')) {
    name = '';  // legacy format
  }
  if (name !== undefined) {
    return { object: 'inline', type: VARIABLE_TYPE, data: { name } };
  }
}
```

### Handling Keyboard Events

`onKeyDown` and `onKeyUp` let you intercept keyboard input in the editor.

**Template Tab Navigation** (from `template-plugins.tsx`):

```typescript
function onKeyDown(event: React.KeyboardEvent, editor: Editor, next: () => void) {
  // Delete a void node when the user types a character while it's selected
  if (
    event.key.length === 1 &&
    editor.value.selection.isCollapsed &&
    editor.value.inlines.find(i => i.type === VARIABLE_TYPE)
  ) {
    const node = editor.value.inlines.find(i => i.type === VARIABLE_TYPE);
    editor.removeNodeByKey(node.key);
    return next();  // Let the character be typed normally
  }

  // Tab / Shift+Tab to jump between template variables
  if (event.keyCode === 9) {
    if (!editor.value.document.getInlinesByType(VARIABLE_TYPE).first()) {
      return next();  // No template vars, let Tab behave normally
    }

    const forwards = !event.shiftKey;
    const current = editor.value.inlines.find(i => i.type === VARIABLE_TYPE);
    const oldSelection = editor.value.selection;

    let nextvar = null;
    if (forwards) {
      editor.moveFocusToEndOfNode(editor.value.document);
      let inlines = editor.value.document
        .getLeafInlinesAtRange(editor.value.selection)
        .toArray()
        .filter(i => i.type === VARIABLE_TYPE);
      if (current) inlines = inlines.slice(inlines.indexOf(current) + 1);
      nextvar = inlines[0];
    } else {
      editor.moveFocusToStartOfNode(editor.value.document);
      let inlines = editor.value.document
        .getLeafInlinesAtRange(editor.value.selection)
        .toArray()
        .filter(i => i.type === VARIABLE_TYPE);
      if (current) inlines = inlines.slice(0, inlines.indexOf(current));
      nextvar = inlines.pop();
    }

    if (nextvar) {
      editor.moveToRangeOfNode(nextvar.nodes.first()).focus();
      event.preventDefault();
      return;  // Handled - don't call next()
    } else {
      editor.select(oldSelection);  // Restore if no next var found
    }
  }

  return next();  // Pass to next plugin
}
```

### Adding Editor Toolbar Buttons

Editor toolbar buttons appear in the formatting toolbar (bold, italic, etc.) — distinct from `Composer:ActionButton` which is in the composer action bar.

Use the `BuildToggleButton` factory for simple toggle buttons:

```typescript
import { BuildToggleButton } from './toolbar-component-factories';

const plugin: ComposerEditorPlugin = {
  toolbarSectionClass: 'my-section',
  toolbarComponents: [
    BuildToggleButton({
      type: MY_TYPE,
      button: {
        iconClass: 'fa fa-tag',
        isActive: (value: Value) => value.inlines.some(i => i.type === MY_TYPE),
        onToggle: (editor: Editor, active: boolean) => {
          if (active) {
            // Remove: convert inline back to text
            const node = editor.value.inlines.find(i => i.type === MY_TYPE);
            editor.removeNodeByKey(node.key).insertText(node.data.get('name'));
          } else {
            // Insert: create new inline from selection or default text
            const node = Inline.create({
              type: MY_TYPE,
              data: {
                name: editor.value.selection.isCollapsed
                  ? 'default'
                  : editor.value.fragment.text,
              },
            });
            editor.insertInlineAtRange(editor.value.selection, node).moveToEnd();
          }
        },
      },
    }),
  ],
};
```

For custom toolbar buttons, provide your own component:

```typescript
const MyToolbarButton = ({ value, editor, className }) => {
  const onClick = () => {
    // Modify the editor
    editor.insertInline({ object: 'inline', type: MY_TYPE, data: { name: 'test' } });
    editor.moveToStartOfNextText().focus();
  };

  return (
    <button className={className} onClick={onClick}>
      <i className="fa fa-star" />
    </button>
  );
};
```

Source: `app/src/components/composer-editor/toolbar-component-factories.tsx`

### Top-Level Components (Floating UI)

`topLevelComponent` renders a React component that floats above the editor. The emoji plugin uses this for the autocomplete dropdown:

```typescript
const plugin: ComposerEditorPlugin = {
  topLevelComponent: FloatingPicker,
  // ...
};

function FloatingPicker({ editor, value }: { editor: Editor; value: Value }) {
  if (!value.selection.isFocused) return null;

  // Read state from marks or document
  const myMark = value.activeMarks.find(m => m.type === 'my-typing-mark');
  if (!myMark) return null;

  // Position relative to the editor content area
  const sel = document.getSelection();
  const range = sel.getRangeAt(0);
  const target = range.endContainer.parentElement.closest('[data-my-typing]');
  if (!target) return null;

  const parent = target.closest('.RichEditor-content') as HTMLElement;
  const parentRect = parent.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  return (
    <div
      className="my-floating-picker"
      style={{
        position: 'absolute',
        left: targetRect.left - parentRect.left,
        top: targetRect.top + targetRect.height - parentRect.top,
      }}
    >
      {/* Picker content */}
    </div>
  );
}
```

### Marks for Transient State

Slate **Marks** are decorations on text (like bold or italic). The emoji plugin creatively uses marks to store transient autocomplete state:

```typescript
// When user types ":", add a mark to track the autocomplete session
editor.addMark({
  type: 'emojitype',
  data: { typed: '', suggestions: [], picked: '' },
});

// As user types more, update the mark data with suggestions
function updateMark(editor, existing, { typed, suggestions, picked }) {
  editor.moveAnchorBackward(typed.length);
  editor.removeMark(existing);
  editor.addMark({
    type: 'emojitype',
    data: { typed, suggestions, picked },
  });
  editor.moveToFocus();
}

// The floating picker reads this mark for its state
const emoji = value.activeMarks.find(i => i.type === 'emojitype');
const suggestions = emoji.data.get('suggestions');
const picked = emoji.data.get('picked');
```

This pattern keeps all autocomplete state inside the document, making it trivially accessible from both keyboard handlers and the floating UI component.

### Auto-Replace Patterns

The `slate-auto-replace` package converts text patterns into custom nodes. The template plugin uses this to convert `{{name}}` into a template variable inline:

```typescript
import AutoReplace from 'slate-auto-replace';

AutoReplace({
  trigger: '}',                       // Fires when user types }
  before: /({{)([^}]+)(})/,          // Pattern to match before cursor
  change: (editor: Editor, e, matches) => {
    const name = matches.before[2];   // Extract variable name
    const node = Inline.create({
      type: VARIABLE_TYPE,
      data: { name },
    });
    editor.insertInlineAtRange(editor.value.selection, node).moveToEnd();
  },
})
```

### Registering Your Editor Plugin

Editor plugins are loaded statically from `app/src/components/composer-editor/conversion.tsx`. To add yours, import it and add it to the `plugins` array:

```typescript
// In conversion.tsx
import MyPlugins from './my-plugins';

export const plugins: ComposerEditorPlugin[] = [
  ...InlineAttachmentPlugins,
  ...UneditablePlugins,
  ...BaseMarkPlugins,
  ...TemplatePlugins,
  ...EmojiPlugins,
  ...MyPlugins,         // Add your plugin here
  ...LinkPlugins,
  ...BaseBlockPlugins,
  ...MarkdownPlugins,
];
```

If your plugin introduces a void node type, add it to the schema:

```typescript
export const schema = {
  inlines: {
    // ...existing types...
    [MY_TYPE]: { isVoid: true },
  },
};
```

---

## Complete Examples

### Example 1: Simple Composer Action Button (Translation)

The translation plugin adds a toolbar button that opens a language picker popover and replaces the draft body with a translated version.

**Key files**: `app/internal_packages/translation/`

```typescript
// main.tsx — Lifecycle
export function activate() {
  ComponentRegistry.register(TranslateComposerButton, {
    role: 'Composer:ActionButton',
  });
}

export function deactivate() {
  ComponentRegistry.unregister(TranslateComposerButton);
}
```

```typescript
// composer-button.tsx — The button component
export class TranslateComposerButton extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  static displayName = 'TranslateComposerButton';

  _onTranslate = async (langName) => {
    Actions.closePopover();
    const translated = await translateMessageBody(this.props.draft.body, langCode);

    // Update the draft body through the session
    this.props.session.changes.add({ body: translated });
    this.props.session.changes.commit();
  };

  _onClick = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(
      <Menu
        items={Object.keys(languages)}
        itemContent={item => item}
        onSelect={this._onTranslate}
      />,
      { originRect: buttonRect, direction: 'up' }
    );
  };

  render() {
    if (this.props.draft.plaintext) return <span />;
    return (
      <button tabIndex={-1} className="btn btn-toolbar" onClick={this._onClick}>
        <RetinaImg url="mailspring://translation/assets/icon@2x.png"
                   mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
```

**Pattern**: ComponentRegistry action button + `session.changes.add({ body })` for content modification. No editor plugin needed.

### Example 2: Full Composer Plugin with Editor Extension (Templates)

The templates plugin is the most complete example. It uses all three plugin systems:

1. **ComponentRegistry** — `TemplatePicker` button (Composer:ActionButton) + `TemplateStatusBar` (Composer:Footer)
2. **ExtensionRegistry.Composer** — `TemplateComposerExtension` warns about empty template areas
3. **Slate Editor Plugin** — `template-plugins.tsx` adds the `templatevar` void inline type

**The Slate plugin provides**:
- A toolbar toggle button (tag icon) to create/remove template variables
- `renderNode` to display variables as styled pills
- `rules` for HTML round-tripping (`<span data-tvar="name">`)
- `onKeyDown` for Tab/Shift+Tab navigation between variables
- `AutoReplace` to convert `{{name}}` shorthand into variable nodes

**Template insertion flow**:
1. User clicks template picker button → `Actions.insertTemplateId()`
2. `TemplateStore` reads template HTML from disk
3. Template HTML is inserted via `session.changes.add({ body: templateHTML + existingContent })`
4. The body setter converts HTML to Slate value, finding `<span data-tvar>` elements and creating `templatevar` inline nodes via the deserialization rules
5. `TemplateStatusBar` detects the variables and shows the "Press tab" hint

### Example 3: Inline Autocomplete with Floating UI (Emoji)

The emoji plugin demonstrates the most sophisticated editor extension pattern:

- **Void inline node** (`emoji`) for inserted emoji, rendered as platform-specific images
- **Mark** (`emojitype`) stores transient autocomplete state in the document
- **topLevelComponent** (`FloatingEmojiPicker`) reads the mark state and renders a positioned dropdown
- **onKeyDown** handles Enter/Space (confirm), Arrow keys (navigate suggestions)
- **onKeyUp** handles character input, triggers suggestion lookup, updates the mark

This "mark as state store" pattern is powerful for any inline autocomplete feature.

---

## Key Imports Reference

### From `mailspring-exports`

```typescript
import {
  // Registries
  ComponentRegistry,
  ExtensionRegistry,

  // Extensions
  ComposerExtension,

  // Flux
  Actions,
  DraftStore,
  DraftEditingSession,
  FeatureUsageStore,
  PreferencesUIStore,

  // Models
  Message,
  MessageWithEditorState,
  Contact,

  // Utilities
  localized,
  PropTypes,
} from 'mailspring-exports';
```

### From `mailspring-component-kit`

```typescript
import {
  RetinaImg,       // Retina-aware images
  Menu,            // Dropdown menu with search, headers, footers
  InjectedComponentSet,
} from 'mailspring-component-kit';
```

### From Slate (for editor plugins)

```typescript
import { Editor, Value, Inline, Block, Mark, Node } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { ComposerEditorPlugin, Rule } from './types';
import { BuildToggleButton } from './toolbar-component-factories';
```

---

## Design Patterns and Best Practices

### Void Nodes for Non-Editable Inline Content

Template variables, emoji, and inline images are all **void inlines** — the cursor can move around them but can't edit their contents. Define them in the schema as `{ isVoid: true }` and set `contentEditable={false}` in the rendered element.

### Dual Rendering with targetIsHTML

Always handle both rendering contexts in `renderNode` and `renderMark`:
- `targetIsHTML: true` — Generating the HTML string that's saved/sent. Use simple, semantic HTML with `data-*` attributes so your deserialization rules can reconstruct the node.
- `targetIsHTML: false` — The interactive editor UI. Use rich React components with click handlers, styling, etc.

### next() Chain

Every `onKeyDown`, `onKeyUp`, `renderNode`, `renderMark`, and `onChange` handler receives a `next` function. Always call `next()` if your plugin doesn't handle the event, or other plugins won't run. If you do handle the event (e.g., `event.preventDefault()` on Tab), return without calling `next()`.

### Body vs. bodyEditorState

The draft has two representations of its body content:
- `draft.body` — HTML string (used by `session.changes.add()`, serialization, and `ComposerExtension` hooks)
- `draft.bodyEditorState` — Slate `Value` object (used by the editor and footer components that inspect editor state)

These are kept in sync via ES6 property descriptors. Writing to one lazily invalidates the other. Prefer using `session.changes.add({ body })` for programmatic changes.

### shouldComponentUpdate

The `draft` prop changes on **every keystroke**. Components registered with `Composer:ActionButton` should implement `shouldComponentUpdate` to avoid unnecessary re-renders unless they actually depend on draft content.

### Popover Direction

Since the composer toolbar is at the bottom of the composer, use `direction: 'up'` when opening popovers from toolbar buttons so the popover opens upward.
