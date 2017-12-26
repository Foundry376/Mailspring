import { React, RegExpUtils } from 'mailspring-exports';
import { RichUtils, Modifier, EditorState, SelectionState } from 'draft-js';

const ENTITY_TYPE = 'LINK';

// TOOLBAR UI

class ToolbarLinkPicker extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      urlValue: '',
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
          urlValue: getCurrentLink(editorState) || '',
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
    const { urlValue } = this.state;
    const { editorState, onChange } = this.props;

    onChange(editorStateSettingExplicitLink(editorState, urlValue));

    this.setState({ expanded: false, urlValue: '' }, () => {
      window.requestAnimationFrame(this.props.onFocusComposer);
    });
  };

  onRemove = e => {
    e.preventDefault();
    const { editorState, onChange } = this.props;
    onChange(editorStateSettingExplicitLink(editorState, null));
  };

  onBlur = e => {
    if (!this._el.contains(e.relatedTarget)) {
      this.setState({ expanded: false });
    }
  };

  render() {
    const { expanded } = this.state;

    return (
      <div className="link-picker" ref={el => (this._el = el)} tabIndex={-1} onBlur={this.onBlur}>
        {getCurrentLink(this.props.editorState) ? (
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
              placeholder="http://"
              value={this.state.urlValue}
              ref={el => (this._inputEl = el)}
              onBlur={this.onBlur}
              onChange={e => this.setState({ urlValue: e.target.value })}
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

// DRAFTJS BEHAVIORS

function isURL(text) {
  return RegExpUtils.urlRegex().test(text);
}
/*
Function you can call from your toolbar or "link button" to manually linkify
the selected text with an "explicit" flag that prevents autolinking from
changing the URL if the user changes the link text.
*/
export function editorStateSettingExplicitLink(editorState, urlOrNull) {
  return editorStateSettingLink(editorState, editorState.getSelection(), {
    url: urlOrNull,
    explicit: true,
  });
}

/*
Returns editor state with a link entity created / updated to hold the link @data
for the range specified by @selection
*/
export function editorStateSettingLink(editorState, selection, data) {
  const contentState = editorState.getCurrentContent();
  const entityKey = getCurrentLinkEntityKey(editorState);

  let nextEditorState = editorState;

  if (!entityKey) {
    const contentStateWithEntity = contentState.createEntity(ENTITY_TYPE, 'MUTABLE', data);
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    nextEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
    nextEditorState = RichUtils.toggleLink(nextEditorState, selection, entityKey);
  } else {
    nextEditorState = EditorState.set(editorState, {
      currentContent: editorState.getCurrentContent().replaceEntityData(entityKey, data),
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
export function getCurrentLinkEntityKey(editorState) {
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
export function getCurrentLink(editorState) {
  const entityKey = getCurrentLinkEntityKey(editorState);
  return (
    entityKey &&
    editorState
      .getCurrentContent()
      .getEntity(entityKey)
      .getData().url
  );
}

export const HTMLConfig = {
  htmlToEntity(nodeName, node, createEntity) {
    if (nodeName === 'a') {
      return createEntity(ENTITY_TYPE, 'MUTABLE', { url: node.getAttribute('href') });
    }
  },
  entityToHTML(entity, originalText) {
    if (entity.type === ENTITY_TYPE) {
      return entity.data.url ? (
        <a href={entity.data.url} title={entity.data.url}>
          {originalText}
        </a>
      ) : (
        <span>{originalText}</span>
      );
    }
  },
};

const createLinkifyPlugin = () => {
  const Link = props => {
    const { url } = props.contentState.getEntity(props.entityKey).getData();
    return url ? (
      <a href={url} title={url}>
        {props.children}
      </a>
    ) : (
      <span>{props.children}</span>
    );
  };

  function findLinkEntities(contentBlock, callback, contentState) {
    contentBlock.findEntityRanges(character => {
      const entityKey = character.getEntity();
      if (!entityKey) return;

      const entity = contentState.getEntity(entityKey);
      return entity.getType() === ENTITY_TYPE && entity.getData().url;
    }, callback);
  }

  return {
    decorators: [
      {
        strategy: findLinkEntities,
        component: Link,
      },
    ],
    toolbarComponents: [ToolbarLinkPicker],
    onChange: editorState => {
      /* This method is called as you edit content in the Editor. We use
      some basic logic to keep the LINK entity in sync with the user's text
      and typing.
      */
      const contentState = editorState.getCurrentContent();
      const selection = editorState.getSelection();
      if (!selection || !selection.isCollapsed()) {
        return editorState;
      }

      const cursorOffset = selection.getStartOffset();
      const cursorBlockKey = selection.getStartKey();
      const cursorBlock = contentState.getBlockForKey(cursorBlockKey);
      if (!['unordered-list-item', 'ordered-list-item', 'unstyled'].includes(cursorBlock.type)) {
        return editorState;
      }

      // Step 1: Get the word around the cursor by splitting the current block's text
      const text = cursorBlock.text;
      const currentWordStart = text.lastIndexOf(' ', cursorOffset) + 1;
      let currentWordEnd = text.indexOf(' ', cursorOffset);
      if (currentWordEnd === -1) {
        currentWordEnd = text.length;
      }
      const currentWord = text.substr(currentWordStart, currentWordEnd - currentWordStart);
      const currentWordIsURL = isURL(currentWord);

      // Step 2: Find the existing LINK entity beneath the user's cursor
      let currentLinkEntityKey = cursorBlock.getEntityAt(Math.min(text.length - 1, cursorOffset));
      const inst = currentLinkEntityKey && contentState.getEntity(currentLinkEntityKey);
      if (inst && inst.getType() !== ENTITY_TYPE) {
        currentLinkEntityKey = null;
      }

      if (currentLinkEntityKey) {
        // Note: we don't touch link values added / removed "explicitly" via the link
        // toolbar button. This means you can make a link with text that doesn't match the link.
        const entityExistingData = contentState.getEntity(currentLinkEntityKey).getData();
        if (entityExistingData.explicit) {
          return editorState;
        }

        if (currentWordIsURL) {
          // We are modifying the URL - update the entity to reflect the current text
          const contentState = editorState.getCurrentContent();
          return EditorState.set(editorState, {
            currentContent: contentState.replaceEntityData(currentLinkEntityKey, {
              explicit: false,
              url: currentWord,
            }),
          });
        } else {
          // We are no longer in a URL but the entity is still present. Remove it from
          // the current character so the linkifying "ends".
          const entityRange = new SelectionState({
            anchorOffset: currentWordStart - 1,
            anchorKey: cursorBlockKey,
            focusOffset: currentWordStart,
            focusKey: cursorBlockKey,
            isBackward: false,
            hasFocus: true,
          });
          return EditorState.set(editorState, {
            currentContent: Modifier.applyEntity(
              editorState.getCurrentContent(),
              entityRange,
              null
            ),
          });
        }
      }

      // There is no entity beneath the current word, but it looks like a URL. Linkify it!
      if (!currentLinkEntityKey && currentWordIsURL) {
        const entityRange = new SelectionState({
          anchorOffset: currentWordStart,
          anchorKey: cursorBlockKey,
          focusOffset: currentWordEnd,
          focusKey: cursorBlockKey,
          isBackward: false,
          hasFocus: false,
        });
        let newEditorState = editorStateSettingLink(editorState, entityRange, {
          explicit: false,
          url: currentWord,
        });

        // reset selection to the initial cursor to avoid selecting the entire links
        newEditorState = EditorState.acceptSelection(newEditorState, selection);
        return newEditorState;
      }

      return editorState;
    },
  };
};

export default createLinkifyPlugin;
