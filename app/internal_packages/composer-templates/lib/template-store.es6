/* eslint global-require: 0*/

import { DraftStore, Actions, QuotedHTMLTransformer } from 'mailspring-exports';
import { remote } from 'electron';
import MailspringStore from 'mailspring-store';
import path from 'path';
import fs from 'fs';

import TemplateActions from './template-actions';

// Support accented characters in template names
// https://regex101.com/r/nD3eY8/1
const INVALID_TEMPLATE_NAME_REGEX = /[^a-zA-Z\u00C0-\u017F0-9_\- ]+/g;

class TemplateStore extends MailspringStore {
  constructor() {
    super();

    this.listenTo(TemplateActions.insertTemplateId, this._onInsertTemplateId);
    this.listenTo(TemplateActions.createTemplate, this._onCreateTemplate);
    this.listenTo(TemplateActions.showTemplates, this._onShowTemplates);
    this.listenTo(TemplateActions.deleteTemplate, this._onDeleteTemplate);
    this.listenTo(TemplateActions.renameTemplate, this._onRenameTemplate);

    this._items = [];
    this._templatesDir = path.join(AppEnv.getConfigDirPath(), 'templates');
    this._welcomeName = 'Welcome to Templates.html';
    this._welcomePath = path.join(__dirname, '..', 'assets', this._welcomeName);
    this._watcher = null;

    // I know this is a bit of pain but don't do anything that
    // could possibly slow down app launch
    fs.exists(this._templatesDir, exists => {
      if (exists) {
        this._populate();
        this.watch();
      } else {
        fs.mkdir(this._templatesDir, () => {
          fs.readFile(this._welcomePath, (err, welcome) => {
            fs.writeFile(path.join(this._templatesDir, this._welcomeName), welcome, () => {
              this.watch();
            });
          });
        });
      }
    });
  }

  directory() {
    return this._templatesDir;
  }

  watch() {
    if (!this._watcher) {
      this._watcher = fs.watch(this._templatesDir, () => this._populate());
    }
  }

  unwatch() {
    if (this._watcher) {
      this._watcher.close();
    }
    this._watcher = null;
  }

  items() {
    return this._items;
  }

  _populate() {
    fs.readdir(this._templatesDir, (err, filenames) => {
      if (err) {
        AppEnv.showErrorDialog({
          title: 'Cannot scan templates directory',
          message: `Mailspring was unable to read the contents of your templates directory (${this
            ._templatesDir}). You may want to delete this folder or ensure filesystem permissions are set correctly.`,
        });
        return;
      }
      this._items = [];
      for (let i = 0, filename; i < filenames.length; i++) {
        filename = filenames[i];
        if (filename[0] === '.') {
          continue;
        }
        const displayname = path.basename(filename, path.extname(filename));
        this._items.push({
          id: filename,
          name: displayname,
          path: path.join(this._templatesDir, filename),
        });
      }
      this.trigger(this);
    });
  }

  _onCreateTemplate({ headerMessageId, name, contents } = {}) {
    if (headerMessageId) {
      this._onCreateTemplateFromDraft(headerMessageId);
      return;
    }
    if (!name || name.length === 0) {
      this._displayError('You must provide a name for your template.');
    }
    if (!contents || contents.length === 0) {
      this._displayError('You must provide contents for your template.');
    }
    this.saveNewTemplate(name, contents, this._onShowTemplates);
  }

  _onCreateTemplateFromDraft(headerMessageId) {
    DraftStore.sessionForClientId(headerMessageId).then(session => {
      const draft = session.draft();
      const draftName = draft.subject.replace(INVALID_TEMPLATE_NAME_REGEX, '');
      let draftContents = QuotedHTMLTransformer.removeQuotedHTML(draft.body);

      const sigIndex = draftContents.indexOf('<signature>');
      draftContents = sigIndex > -1 ? draftContents.slice(0, sigIndex) : draftContents;
      if (!draftName || draftName.length === 0) {
        this._displayError('Give your draft a subject to name your template.');
      }
      if (!draftContents || draftContents.length === 0) {
        this._displayError('To create a template you need to fill the body of the current draft.');
      }
      this.saveNewTemplate(draftName, draftContents, this._onShowTemplates);
    });
  }

  _onShowTemplates() {
    Actions.switchPreferencesTab('Templates');
    Actions.openPreferences();
  }

  _displayError(message) {
    remote.dialog.showErrorBox('Template Creation Error', message);
  }

  _displayDialog(title, message, buttons) {
    return (
      remote.dialog.showMessageBox({
        title: title,
        message: title,
        detail: message,
        buttons: buttons,
        type: 'info',
      }) === 0
    );
  }

  saveNewTemplate(name, contents, callback) {
    if (!name || name.length === 0) {
      this._displayError('You must provide a template name.');
      return;
    }

    if (name.match(INVALID_TEMPLATE_NAME_REGEX)) {
      this._displayError(
        'Invalid template name! Names can only contain letters, numbers, spaces, dashes, and underscores.'
      );
      return;
    }

    let number = 1;
    let resolvedName = name;
    const sameName = t => t.name === resolvedName;
    while (this._items.find(sameName)) {
      resolvedName = `${name} ${number}`;
      number += 1;
    }
    this.saveTemplate(resolvedName, contents, callback);
    this.trigger(this);
  }

  saveTemplate(name, contents, callback) {
    const filename = `${name}.html`;
    const templatePath = path.join(this._templatesDir, filename);
    let template = this._items.find(t => t.name === name);

    this.unwatch();
    fs.writeFile(templatePath, contents, err => {
      this.watch();
      if (err) {
        this._displayError(err);
      }
      if (template === null) {
        template = {
          id: filename,
          name: name,
          path: templatePath,
        };
        this._items.unshift(template);
      }
      if (callback) {
        callback(template);
      }
    });
  }

  _onDeleteTemplate(name) {
    const template = this._items.find(t => t.name === name);
    if (!template) {
      return;
    }

    if (
      this._displayDialog(
        'Delete this template?',
        'The template and its file will be permanently deleted.',
        ['Delete', 'Cancel']
      )
    ) {
      fs.unlink(template.path, () => {
        this._populate();
      });
    }
  }

  _onRenameTemplate(name, newName) {
    const template = this._items.find(t => t.name === name);
    if (!template) {
      return;
    }

    if (newName.match(INVALID_TEMPLATE_NAME_REGEX)) {
      this._displayError(
        'Invalid template name! Names can only contain letters, numbers, spaces, dashes, and underscores.'
      );
      return;
    }
    if (newName.length === 0) {
      this._displayError('You must provide a template name.');
      return;
    }

    const newFilename = `${newName}.html`;
    const oldPath = path.join(this._templatesDir, `${name}.html`);
    const newPath = path.join(this._templatesDir, newFilename);
    fs.rename(oldPath, newPath, () => {
      template.name = newName;
      template.id = newFilename;
      template.path = newPath;
      this.trigger(this);
    });
  }

  _onInsertTemplateId({ templateId, headerMessageId } = {}) {
    const template = this._items.find(t => t.id === templateId);
    const templateBody = fs.readFileSync(template.path).toString();
    DraftStore.sessionForClientId(headerMessageId).then(session => {
      let proceed = true;
      if (!session.draft().pristine && !session.draft().hasEmptyBody()) {
        proceed = this._displayDialog(
          'Replace draft contents?',
          'It looks like your draft already has some content. Loading this template will ' +
            'overwrite all draft contents.',
          ['Replace contents', 'Cancel']
        );
      }

      if (proceed) {
        const current = session.draft().body;
        let insertion = current.length;
        for (const s of [
          '<p><signature',
          '<div class="gmail_quote_attribution"',
          '<blockquote class="gmail_quote"',
        ]) {
          const i = current.indexOf(s);
          if (i !== -1) {
            insertion = Math.min(insertion, i);
          }
        }
        session.changes.add({ body: `${templateBody}${current.substr(insertion)}` });
      }
    });
  }
}

export default new TemplateStore();
