import fs from 'fs';
import React from 'react';
import ReactDOM from 'react-dom';
import { Flexbox, EditableList, ComposerEditor, ComposerSupport } from 'mailspring-component-kit';
import { Actions, localized, localizedReactFragment } from 'mailspring-exports';
import { shell } from 'electron';
import { Value } from 'slate';

import TemplateStore from './template-store';

interface ITemplate {
  path: string;
  name: string;
}
const { Conversion: { convertFromHTML, convertToHTML } } = ComposerSupport;

interface TemplateEditorProps {
  template: ITemplate;
  onEditTitle: (title: string) => void;
}
class TemplateEditor extends React.Component<
  TemplateEditorProps,
  { readOnly: boolean; editorState: Value }
> {
  _composer: ComposerEditor;

  constructor(props) {
    super(props);

    if (this.props.template) {
      const inHTML = fs.readFileSync(props.template.path).toString();
      this.state = {
        editorState: convertFromHTML(inHTML),
        readOnly: false,
      };
    } else {
      this.state = {
        editorState: convertFromHTML(''),
        readOnly: true,
      };
    }
  }

  _onSave = () => {
    if (!this.state.readOnly) {
      const outHTML = convertToHTML(this.state.editorState);
      fs.writeFileSync(this.props.template.path, outHTML);
    }
  };

  _onFocusEditor = e => {
    if (e.target === ReactDOM.findDOMNode(this._composer)) {
      this._composer.focusEndAbsolute();
    }
  };

  render() {
    const { onEditTitle, template } = this.props;
    const { readOnly, editorState } = this.state;

    return (
      <div className={`template-wrap ${readOnly && 'empty'}`}>
        <div className="section">
          <input
            type="text"
            id="title"
            placeholder={localized('Name')}
            style={{ maxWidth: 400 }}
            defaultValue={template ? template.name : ''}
            onBlur={e => onEditTitle(e.target.value)}
          />
        </div>
        <div className="section editor" onClick={this._onFocusEditor}>
          <ComposerEditor
            ref={c => (this._composer = c)}
            value={editorState}
            propsForPlugins={{ inTemplateEditor: true }}
            onChange={change => this.setState({ editorState: change.value })}
            onBlur={this._onSave}
          />
        </div>
        <div className="section note">
          {localizedReactFragment(
            'Changes are saved automatically. View the %@ for tips and tricks.',
            <a href="https://foundry376.zendesk.com/hc/en-us/articles/115001875231-Using-quick-reply-templates">
              {localized('Templates Guide')}
            </a>
          )}
        </div>
      </div>
    );
  }
}

export default class PreferencesTemplates extends React.Component<
  {},
  { selected: ITemplate; templates: ITemplate[] }
> {
  static displayName = 'PreferencesTemplates';

  unsubscribers: Array<() => void>;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribers = [
      TemplateStore.listen(() => {
        this.setState(this._getStateFromStores());
      }),
    ];
  }

  componentWillUnmount() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  _getStateFromStores() {
    let lastSelName = null;
    let lastSelIndex = null;
    if (this.state) {
      lastSelName = this.state.selected && this.state.selected.name;
      lastSelIndex = this.state.templates.findIndex(t => t.name === lastSelName);
    }

    const templates = TemplateStore.items();
    const selected = templates.find(t => t.name === lastSelName) || templates[lastSelIndex] || null;

    return {
      templates,
      selected,
    };
  }

  _onAdd = () => {
    Actions.createTemplate({
      name: localized('Untitled'),
      contents: localized('Insert content here!'),
    });
  };

  _onDelete = () => {
    Actions.deleteTemplate(this.state.selected.name);
  };

  _onEditTitle = newName => {
    Actions.renameTemplate(this.state.selected.name, newName);
  };

  _onSelect = item => {
    this.setState({ selected: item });
  };

  render() {
    const { selected } = this.state;

    return (
      <div className="preferences-templates-container">
        <section>
          <Flexbox>
            <div>
              <EditableList
                showEditIcon
                className="template-list"
                items={this.state.templates}
                itemContent={template => template.name}
                onCreateItem={this._onAdd}
                onDeleteItem={this._onDelete}
                onItemEdited={this._onEditTitle}
                onSelectItem={this._onSelect}
                selected={this.state.selected}
              />
              <a
                style={{
                  marginTop: 10,
                  display: 'block',
                  fontSize: '0.9em',
                }}
                onClick={() => shell.showItemInFolder(TemplateStore.directory())}
              >
                {localized('Show Templates Folder...')}
              </a>
            </div>
            <TemplateEditor
              onEditTitle={this._onEditTitle}
              key={selected ? selected.name : 'empty'}
              template={selected}
            />
          </Flexbox>
        </section>
      </div>
    );
  }
}
