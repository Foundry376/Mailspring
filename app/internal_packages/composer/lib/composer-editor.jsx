import React from 'react';
import { Editor, RichUtils, Modifier, CompositeDecorator, EditorState } from 'draft-js';

const BLOCK_TYPES = [
  { label: 'H1', style: 'header-one' },
  { label: 'H2', style: 'header-two' },
  { label: 'H3', style: 'header-three' },
  { label: 'H4', style: 'header-four' },
  { label: 'H5', style: 'header-five' },
  { label: 'H6', style: 'header-six' },
  { label: 'Blockquote', style: 'blockquote' },
  { label: 'UL', style: 'unordered-list-item' },
  { label: 'OL', style: 'ordered-list-item' },
  { label: 'Code Block', style: 'code-block' },
];

var INLINE_STYLES = [
  { label: 'Bold', style: 'BOLD' },
  { label: 'Italic', style: 'ITALIC' },
  { label: 'Underline', style: 'UNDERLINE' },
  { label: 'Monospace', style: 'CODE' },
];

const BlockStyleControls = props => {
  const { editorState } = props;
  const selection = editorState.getSelection();
  const blockType = editorState
    .getCurrentContent()
    .getBlockForKey(selection.getStartKey())
    .getType();

  return (
    <div className="RichEditor-controls">
      {BLOCK_TYPES.map(type => (
        <StyleButton
          key={type.label}
          active={type.style === blockType}
          label={type.label}
          onToggle={props.onToggle}
          style={type.style}
        />
      ))}
    </div>
  );
};

const InlineStyleControls = props => {
  var currentStyle = props.editorState.getCurrentInlineStyle();
  return (
    <div className="RichEditor-controls">
      {INLINE_STYLES.map(type => (
        <StyleButton
          key={type.label}
          active={currentStyle.has(type.style)}
          label={type.label}
          onToggle={props.onToggle}
          style={type.style}
        />
      ))}
    </div>
  );
};

// Custom overrides for "code" style.
const styleMap = {
  CODE: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
    fontSize: 16,
    padding: 2,
  },
};

function getStyle(style) {
  let styles = {};

  // apply basic styles from the map above
  for (const key of Object.keys(styleMap)) {
    if (style.has(key)) {
      styles = Object.assign(styles, styleMap[key]);
    }
  }

  // apply custom styles where data is encoded in the key
  const color = style.filter(value => value.startsWith('#')).first();
  if (color) {
    styles.color = color;
  }
  return styles;
}

function getBlockStyle(block) {
  switch (block.getType()) {
    case 'blockquote':
      return 'RichEditor-blockquote';
    default:
      return null;
  }
}

const Link = props => {
  const { url } = props.contentState.getEntity(props.entityKey).getData();
  return (
    <a href={url} title={url}>
      {props.children}
    </a>
  );
};

function findLinkEntities(contentBlock, callback, contentState) {
  contentBlock.findEntityRanges(character => {
    const entityKey = character.getEntity();
    return entityKey !== null && contentState.getEntity(entityKey).getType() === 'LINK';
  }, callback);
}

const decorator = new CompositeDecorator([
  {
    strategy: findLinkEntities,
    component: Link,
  },
]);

const ColorControls = props => {
  var currentStyle = props.editorState.getCurrentInlineStyle();
  return (
    <div>
      <StyleButton
        active={currentStyle.has('#ff0000')}
        label={'Red'}
        onToggle={() => props.onSetColor('#ff0000')}
        style={{ color: 'red' }}
      />
      <StyleButton
        active={currentStyle.has('#00ff00')}
        label={'Green'}
        onToggle={() => props.onSetColor('#00ff00')}
        style={{ color: 'green' }}
      />
      <StyleButton
        active={false}
        label={'Clear'}
        onToggle={() => props.onSetColor(null)}
        style={{ color: 'black' }}
      />
    </div>
  );
};

class StyleButton extends React.Component {
  constructor() {
    super();
    this.onToggle = e => {
      e.preventDefault();
      this.props.onToggle(this.props.style);
    };
  }

  render() {
    let className = 'RichEditor-styleButton';
    if (this.props.active) {
      className += ' RichEditor-activeButton';
    }

    return (
      <span className={className} onMouseDown={this.onToggle}>
        {this.props.label}
      </span>
    );
  }
}

export default class ComposerEditor extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      urlValue: '',
      showURLInput: false,
    };
  }

  componentDidMount() {
    // attach the decorators we use to EditorState
    this.props.onChange(EditorState.set(this.props.editorState, { decorator }));
  }

  focus = () => {
    this._editorComponent.focus();
  };

  focusAbsoluteEnd = () => {
    window.requestAnimationFrame(() => {
      this.props.onChange(EditorState.moveSelectionToEnd(this.props.editorState));
      this._editorComponent.focus();
    });
  };

  onHandleKeyCommand = (command, editorState) => {
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      this.props.onChange(newState);
      return true;
    }
    return false;
  };

  onTab = e => {
    const maxDepth = 4;
    const { editorState, onChange } = this.props;
    onChange(RichUtils.onTab(e, editorState, maxDepth));
  };

  onToggleBlockType = blockType => {
    const { editorState, onChange } = this.props;
    onChange(RichUtils.toggleBlockType(editorState, blockType));
  };

  onToggleInlineStyle = inlineStyle => {
    const { editorState, onChange } = this.props;
    onChange(RichUtils.toggleInlineStyle(editorState, inlineStyle));
  };

  onSetColor = desiredColorKey => {
    const { editorState, onChange } = this.props;
    const currentStyle = editorState.getCurrentInlineStyle();
    const currentColorKey = currentStyle.filter(value => value.startsWith('#')).first();

    let nextEditorState = editorState;

    if (currentColorKey && currentColorKey !== desiredColorKey) {
      nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, currentColorKey);
    }
    if (desiredColorKey) {
      nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, desiredColorKey);
    }

    onChange(nextEditorState);
  };

  onURLChange = e => {
    this.setState({ urlValue: e.target.value });
  };

  onPromptForLink = e => {
    e.preventDefault();
    const { editorState } = this.props;

    const selection = editorState.getSelection();
    if (!selection.isCollapsed()) {
      const contentState = editorState.getCurrentContent();
      const startKey = editorState.getSelection().getStartKey();
      const startOffset = editorState.getSelection().getStartOffset();
      const blockWithLinkAtBeginning = contentState.getBlockForKey(startKey);
      const linkKey = blockWithLinkAtBeginning.getEntityAt(startOffset);

      let url = '';
      if (linkKey) {
        const linkInstance = contentState.getEntity(linkKey);
        url = linkInstance.getData().url;
      }

      this.setState(
        {
          showURLInput: true,
          urlValue: url,
        },
        () => {
          setTimeout(() => this._linkInputEl.focus(), 0);
        }
      );
    }
  };

  onConfirmLink = e => {
    e.preventDefault();
    const { urlValue } = this.state;
    const { editorState, onChange } = this.props;
    const contentState = editorState.getCurrentContent();
    const contentStateWithEntity = contentState.createEntity('LINK', 'MUTABLE', { url: urlValue });
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
    onChange(RichUtils.toggleLink(newEditorState, newEditorState.getSelection(), entityKey));

    this.setState(
      {
        showURLInput: false,
        urlValue: '',
      },
      () => {
        window.requestAnimationFrame(this.focus);
      }
    );
  };

  onRemoveLink = e => {
    e.preventDefault();
    const { editorState, onChange } = this.props;
    const selection = editorState.getSelection();
    if (!selection.isCollapsed()) {
      onChange(RichUtils.toggleLink(editorState, selection, null));
    }
  };

  render() {
    const { className, editorState, onChange } = this.props;

    let urlInput;
    if (this.state.showURLInput) {
      urlInput = (
        <div className="link-input-container">
          <input
            onChange={this.onURLChange}
            ref={el => (this._linkInputEl = el)}
            type="text"
            value={this.state.urlValue}
            onKeyDown={e => {
              if (e.which === 13) {
                this.onConfirmLink(e);
              }
            }}
          />
          <button onMouseDown={this.onConfirmLink}>Confirm</button>
        </div>
      );
    }

    return (
      <div className="RichEditor-root">
        <BlockStyleControls editorState={editorState} onToggle={this.onToggleBlockType} />
        <InlineStyleControls editorState={editorState} onToggle={this.onToggleInlineStyle} />
        <ColorControls editorState={editorState} onSetColor={this.onSetColor} />

        <div>
          <button onMouseDown={this.onPromptForLink} style={{ marginRight: 10 }}>
            Add Link
          </button>
          <button onMouseDown={this.onRemoveLink}>Remove Link</button>
        </div>
        {urlInput}

        <div className={className} onClick={this.focus}>
          <Editor
            blockStyleFn={getBlockStyle}
            customStyleFn={getStyle}
            spellCheck
            ref={el => (this._editorComponent = el)}
            editorState={editorState}
            handleKeyCommand={this.onHandleKeyCommand}
            onChange={onChange}
            onTab={this.onTab}
          />
        </div>
      </div>
    );
  }
}
