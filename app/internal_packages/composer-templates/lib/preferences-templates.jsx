import fs from 'fs';
import { Flexbox, EditableList, ComposerEditor, ComposerSupport } from 'mailspring-component-kit';
import { React, ReactDOM } from 'mailspring-exports';

import TemplateStore from './template-store';
import TemplateActions from './template-actions';

const { Conversion: { convertFromHTML, convertToHTML } } = ComposerSupport;

class TemplateEditor extends React.Component {
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
            placeholder="Name"
            style={{ maxWidth: 400 }}
            defaultValue={template ? template.name : ''}
            onBlur={e => onEditTitle(e.target.value)}
          />
        </div>
        <div className="section" onClick={this._onFocusEditor}>
          <ComposerEditor
            ref={c => (this._composer = c)}
            readOnly={readOnly}
            value={editorState}
            propsForPlugins={{ inTemplateEditor: true }}
            onChange={change => this.setState({ editorState: change.value })}
            onBlur={this._onSave}
          />
        </div>
      </div>
    );
  }
}

export default class PreferencesTemplates extends React.Component {
  static displayName = 'PreferencesTemplates';

  constructor() {
    super();
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
    TemplateActions.createTemplate({ name: 'Untitled', content: '' });
  };

  _onDelete = () => {
    TemplateActions.deleteTemplate(this.state.selected.name);
  };

  _onEditTitle = newName => {
    TemplateActions.renameTemplate(this.state.selected.name, newName);
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
