import React from 'react';
import { RichUtils, EditorState } from 'draft-js';

const ENTITY_TYPE = 'TEMPLATEVAR';

// TOOLBAR UI

class ToolbarVariablePicker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      name: '',
      expanded: false,
    };
  }

  onPrompt = e => {
    e.preventDefault();
    const { editorState } = this.props;

    const selection = editorState.getSelection();
    if (!selection.isCollapsed()) {
      this.setState(
        {
          expanded: true,
          name: getCurrentTemplateVarName(editorState) || '',
        },
        () => {
          setTimeout(() => this._inputEl.focus(), 0);
        }
      );
    }
  };

  onConfirm = e => {
    e.preventDefault();

    // attach the URL value to the LINK that was created when we opened the link modal
    const { name } = this.state;
    const { editorState, onChange } = this.props;

    onChange(editorStateSettingTemplateVarName(editorState, name));

    this.setState({ expanded: false, name: '' }, () => {
      window.requestAnimationFrame(this.props.onFocusComposer);
    });
  };

  onRemove = e => {
    e.preventDefault();
    const { editorState, onChange } = this.props;
    onChange(editorStateSettingTemplateVarName(editorState, null));
  };

  onBlur = e => {
    if (!this._el.contains(e.relatedTarget)) {
      this.setState({ expanded: false });
    }
  };

  render() {
    const { expanded } = this.state;

    return (
      <div
        className="template-var-picker"
        ref={el => (this._el = el)}
        tabIndex={-1}
        onBlur={this.onBlur}
      >
        {getCurrentTemplateVarName(this.props.editorState) ? (
          <button onMouseDown={this.onRemove}>
            <i className="fa fa-unlink" />
          </button>
        ) : (
          <button onMouseDown={this.onPrompt}>
            <i className="fa fa-link" />
          </button>
        )}
        {expanded && (
          <div className="dropdown">
            <input
              type="text"
              placeholder="first_name"
              value={this.state.name}
              ref={el => (this._inputEl = el)}
              onBlur={this.onBlur}
              onChange={e => this.setState({ name: e.target.value })}
              onKeyDown={e => {
                if (e.which === 13) {
                  this.onConfirm(e);
                }
              }}
            />
            <button onMouseDown={this.onConfirm}>Add</button>
          </div>
        )}
      </div>
    );
  }
}

// DRAFTJS CONFIG

/*
Returns editor state with a link entity created / updated to hold the link @data
for the range specified by @selection
*/
export function editorStateSettingTemplateVarName(editorState, selection, name) {
  const contentState = editorState.getCurrentContent();
  const entityKey = getCurrentEntityKey(editorState);

  let nextEditorState = editorState;

  if (!entityKey) {
    const contentStateWithEntity = contentState.createEntity(ENTITY_TYPE, 'MUTABLE', { name });
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    nextEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
    nextEditorState = RichUtils.toggleLink(nextEditorState, selection, entityKey);
  } else {
    nextEditorState = EditorState.set(editorState, {
      currentContent: editorState.getCurrentContent().replaceEntityData(entityKey, { name }),
    });
    // this is a hack that forces the editor to update
    // https://github.com/facebook/draft-js/issues/1047
    nextEditorState = EditorState.forceSelection(nextEditorState, editorState.getSelection());
  }

  return nextEditorState;
}

/*
Returns the entityKey for the link entity the user is currently within.
*/
export function getCurrentEntityKey(editorState) {
  const contentState = editorState.getCurrentContent();
  const startKey = editorState.getSelection().getStartKey();
  const startOffset = editorState.getSelection().getStartOffset();
  const block = contentState.getBlockForKey(startKey);
  const linkKey = block.getEntityAt(Math.min(block.text.length - 1, startOffset));

  if (linkKey) {
    const linkInstance = contentState.getEntity(linkKey);
    if (linkInstance.getType() === ENTITY_TYPE) {
      return linkKey;
    }
  }
  return null;
}

/*
Returns the URL for the link entity the user is currently within.
*/
export function getCurrentTemplateVarName(editorState) {
  const entityKey = getCurrentEntityKey(editorState);
  return (
    entityKey &&
    editorState
      .getCurrentContent()
      .getEntity(entityKey)
      .getData().name
  );
}

export const HTMLConfig = {
  htmlToEntity(nodeName, node, createEntity) {
    if (nodeName === 'code') {
      return createEntity(ENTITY_TYPE, 'MUTABLE', { name: node.textContent });
    }
    if (nodeName === 'span' && node.dataset.tvarname) {
      return createEntity(ENTITY_TYPE, 'MUTABLE', { name: node.dataset.tvar });
    }
  },
  entityToHTML(entity, originalText) {
    if (entity.type === ENTITY_TYPE) {
      return <span data-tvarname={entity.data.name}>{originalText}</span>;
    }
  },
};

const createTemplatesPlugin = () => {
  const TemplateVar = props => {
    const { name } = props.contentState.getEntity(props.entityKey).getData();
    return (
      <code
        onClick={e => {
          document.getSelection().setBaseAndExtent(e.target, 0, e.target, e.textContent.length);
        }}
        className="var empty"
      >
        {props.children}
        <span contentEditable={false}>{`(${name})`}</span>
      </code>
    );
  };

  function findTemplateVarEntities(contentBlock, callback, contentState) {
    contentBlock.findEntityRanges(character => {
      const entityKey = character.getEntity();
      if (!entityKey) return;

      const entity = contentState.getEntity(entityKey);
      return entity.getType() === ENTITY_TYPE;
    }, callback);
  }

  return {
    toolbarComponents: [ToolbarVariablePicker],
    decorators: [
      {
        strategy: findTemplateVarEntities,
        component: TemplateVar,
      },
    ],
  };
};

export default createTemplatesPlugin;
