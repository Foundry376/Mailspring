import fs from 'fs';
import React from 'react';
import ReactDOM from 'react-dom';
import { Flexbox, EditableList, ComposerEditor, ComposerSupport } from 'mailspring-component-kit';
import { Actions, localized, localizedReactFragment } from 'mailspring-exports';
import { Value } from 'slate';

import TemplateStore, { TemplateItem } from './template-store';
import { parseTemplate, stringifyTemplate } from './template-file';

const {
  Conversion: { convertFromHTML, convertToHTML },
} = ComposerSupport;

interface TemplateEditorProps {
  template: TemplateItem;
  onEditTitle: (title: string) => void;
}
class TemplateEditor extends React.Component<
  TemplateEditorProps,
  { readOnly: boolean; editorState: Value; subject: string }
> {
  _composer: ComposerEditor;

  constructor(props) {
    super(props);

    if (this.props.template) {
      const { subject, body } = parseTemplate(fs.readFileSync(props.template.path).toString());
      this.state = {
        editorState: convertFromHTML(body),
        subject,
        readOnly: false,
      };
    } else {
      this.state = {
        editorState: convertFromHTML(''),
        subject: '',
        readOnly: true,
      };
    }
  }

  _onSave = () => {
    if (!this.state.readOnly) {
      const outHTML = stringifyTemplate({
        subject: this.state.subject,
        body: convertToHTML(this.state.editorState),
      });
      fs.writeFileSync(this.props.template.path, outHTML);
    }
  };

  _onSubjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ subject: e.target.value });
  };

  _onFocusEditor = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === ReactDOM.findDOMNode(this._composer)) {
      this._composer.focusEndAbsolute();
    }
  };

  render() {
    const { onEditTitle, template } = this.props;
    const { readOnly, editorState, subject } = this.state;

    return (
      <div className={`template-wrap ${readOnly && 'empty'}`}>
        <div className="section fields">
          <div className="field name">
            <label htmlFor="template-title" className="sr-only">
              {localized('Template Name')}
            </label>
            <input
              type="text"
              id="template-title"
              placeholder={localized('Name')}
              disabled={readOnly}
              defaultValue={template ? template.name : ''}
              onBlur={(e) => onEditTitle(e.target.value)}
            />
          </div>
          <div className="field subject">
            <label htmlFor="template-subject" className="sr-only">
              {localized('Subject')}
            </label>
            <input
              type="text"
              id="template-subject"
              placeholder={localized('Subject (optional)')}
              disabled={readOnly}
              value={subject}
              onChange={this._onSubjectChange}
              onBlur={this._onSave}
            />
          </div>
        </div>
        <div className="section editor" onClick={this._onFocusEditor}>
          <ComposerEditor
            ref={(c) => (this._composer = c)}
            value={editorState}
            readOnly={readOnly}
            propsForPlugins={{ inTemplateEditor: true }}
            onChange={(change) => this.setState({ editorState: change.value })}
            onBlur={this._onSave}
          />
        </div>
        <div className="section note">
          {localized(
            'The subject is filled into your draft when you use the template. Leave it blank to keep the subject you already have.'
          )}{' '}
          {localizedReactFragment(
            'Changes are saved automatically. View the %@ for tips and tricks.',
            <a href="https://community.getmailspring.com/t/reply-faster-with-email-templates/167">
              {localized('Templates Guide')}
            </a>
          )}
        </div>
      </div>
    );
  }
}

export default class PreferencesTemplates extends React.Component<
  Record<string, unknown>,
  { selected: TemplateItem; templates: TemplateItem[] }
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
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  _getStateFromStores() {
    let lastSelName = null;
    let lastSelIndex = null;
    if (this.state) {
      lastSelName = this.state.selected && this.state.selected.name;
      lastSelIndex = this.state.templates.findIndex((t) => t.name === lastSelName);
    }

    const templates = TemplateStore.items();
    const selected =
      templates.find((t) => t.name === lastSelName) || templates[lastSelIndex] || null;

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

  _onEditTitle = (newName: string) => {
    Actions.renameTemplate(this.state.selected.name, newName);
  };

  _onSelect = (item: TemplateItem) => {
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
                itemContent={(template) => template.name}
                onCreateItem={this._onAdd}
                onDeleteItem={this._onDelete}
                onItemEdited={this._onEditTitle}
                onSelectItem={this._onSelect}
                selected={this.state.selected}
              />
              <a
                style={{
                  display: 'block',
                  fontSize: '0.9em',
                  padding: 6,
                  margin: -6,
                  marginTop: 4,
                }}
                onClick={() =>
                  require('@electron/remote').shell.showItemInFolder(TemplateStore.directory())
                }
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
