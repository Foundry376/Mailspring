/* eslint global-require: 0*/

import {
  localized,
  DraftStore,
  Actions,
  QuotedHTMLTransformer,
  RegExpUtils,
} from 'mailspring-exports';

import MailspringStore from 'mailspring-store';
import path from 'path';
import fs from 'fs';

import { parseTemplate, stringifyTemplate, ParsedTemplate } from './template-file';

// Support accented characters in template names
// https://regex101.com/r/nD3eY8/1
const INVALID_TEMPLATE_NAME_REGEX = /[^a-zA-Z\u00C0-\u017F0-9_\- ]+/g;

export interface TemplateItem {
  id: string;
  name: string;
  path: string;
  subject: string;
}

class TemplateStore extends MailspringStore {
  private _items: TemplateItem[] = [];
  private _templatesDir = path.join(AppEnv.getConfigDirPath(), 'templates');
  private _watcher = null;

  constructor() {
    super();

    this.listenTo(Actions.insertTemplateId, this._onInsertTemplateId);
    this.listenTo(Actions.createTemplate, this._onCreateTemplate);
    this.listenTo(Actions.showTemplates, this._onShowTemplates);
    this.listenTo(Actions.deleteTemplate, this._onDeleteTemplate);
    this.listenTo(Actions.renameTemplate, this._onRenameTemplate);

    // I know this is a bit of pain but don't do anything that
    // could possibly slow down app launch
    fs.exists(this._templatesDir, (exists) => {
      if (exists) {
        this._populate();
        this.watch();
      } else {
        fs.mkdir(this._templatesDir, () => {
          this._welcomeTemplate().then((welcomeTemplate) => {
            fs.readFile(welcomeTemplate.path, (err, welcome) => {
              fs.writeFile(path.join(this._templatesDir, welcomeTemplate.name), welcome, () => {
                this.watch();
              });
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
      try {
        this._watcher = fs.watch(this._templatesDir, () => this._populate());
      } catch (err) {
        // usually an ENOSPC error
        console.warn(err);
      }
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

  async _populate() {
    let filenames = [];
    try {
      filenames = await fs.promises.readdir(this._templatesDir);
    } catch (err) {
      AppEnv.showErrorDialog({
        title: localized('Cannot scan templates directory'),
        message: localized(
          'Mailspring was unable to read the contents of your templates directory (%@). You may want to delete this folder or ensure filesystem permissions are set correctly.',
          this._templatesDir
        ),
      });
      return;
    }

    // Read each template so we know its subject line - they're small HTML files
    // and we want to show / search subjects alongside template names.
    this._items = await Promise.all(
      filenames
        .filter((filename) => filename[0] !== '.')
        .map(async (filename) => {
          const templatePath = path.join(this._templatesDir, filename);
          let subject = '';
          try {
            subject = parseTemplate(await fs.promises.readFile(templatePath, 'utf8')).subject;
          } catch (err) {
            // an unreadable file or a subdirectory - list it without a subject
          }
          return {
            id: filename,
            name: path.basename(filename, path.extname(filename)),
            path: templatePath,
            subject,
          };
        })
    );
    this.trigger(this);
  }

  _onCreateTemplate({
    headerMessageId,
    name,
    contents,
    subject,
  }: {
    headerMessageId?: string;
    name?: string;
    contents?: string;
    subject?: string;
  } = {}) {
    if (headerMessageId) {
      this._onCreateTemplateFromDraft(headerMessageId);
      return;
    }
    if (!name || name.length === 0) {
      this._displayError(localized('You must provide a name for your template.'));
      return;
    }
    if (!contents || contents.length === 0) {
      this._displayError(localized('You must provide contents for your template.'));
      return;
    }
    this.saveNewTemplate(name, { subject: subject || '', body: contents }, this._onShowTemplates);
  }

  async _onCreateTemplateFromDraft(headerMessageId: string) {
    const session = await DraftStore.sessionForClientId(headerMessageId);
    const draft = session.draft();
    const draftSubject = (draft.subject || '').trim();
    const draftName = draftSubject.replace(INVALID_TEMPLATE_NAME_REGEX, '');

    let draftContents = QuotedHTMLTransformer.removeQuotedHTML(draft.body);
    const sigIndex = draftContents.search(RegExpUtils.mailspringSignatureRegex());
    draftContents = sigIndex > -1 ? draftContents.substr(0, sigIndex) : draftContents;

    if (!draftName || draftName.length === 0) {
      this._displayError(localized('Give your draft a subject to name your template.'));
      return;
    }
    if (!draftContents || draftContents.length === 0) {
      this._displayError(
        localized('To create a template you need to fill the body of the current draft.')
      );
      return;
    }

    // The draft's subject becomes both the template's name and its subject line,
    // so using the template later fills the subject back in. Not for a reply or
    // a forward though - a "Re:" / "Fwd:" subject belongs to the thread the draft
    // came from, and it's the one thing we'd refuse to apply on the way back out.
    const isThreadSubject = !!draft.replyToHeaderMessageId || !!draft.forwardedHeaderMessageId;

    this.saveNewTemplate(
      draftName,
      { subject: isThreadSubject ? '' : draftSubject, body: draftContents },
      this._onShowTemplates
    );
  }

  _onShowTemplates() {
    Actions.switchPreferencesTab('Templates');
    Actions.openPreferences();
  }

  _displayError(message: string) {
    AppEnv.showErrorDialog({ title: localized('Template Creation Error'), message });
  }

  _displayDialog(title: string, message: string, buttons: string[]) {
    return (
      require('@electron/remote').dialog.showMessageBoxSync({
        title: title,
        message: title,
        detail: message,
        buttons: buttons,
        type: 'info',
      }) === 0
    );
  }

  saveNewTemplate(
    name: string,
    template: ParsedTemplate,
    callback: (template: TemplateItem) => void
  ) {
    if (!name || name.length === 0) {
      this._displayError(localized('You must provide a template name.'));
      return;
    }

    if (name.match(INVALID_TEMPLATE_NAME_REGEX)) {
      this._displayError(
        localized(
          'Invalid template name! Names can only contain letters, numbers, spaces, dashes, and underscores.'
        )
      );
      return;
    }

    let number = 1;
    let resolvedName = name;
    const sameName = (t: TemplateItem) => t.name === resolvedName;
    while (this._items.find(sameName)) {
      resolvedName = `${name} ${number}`;
      number += 1;
    }
    this.saveTemplate(resolvedName, template, callback);
    this.trigger(this);
  }

  saveTemplate(
    name: string,
    { subject, body }: ParsedTemplate,
    callback: (template: TemplateItem) => void
  ) {
    const filename = `${name}.html`;
    const templatePath = path.join(this._templatesDir, filename);
    let template = this._items.find((t) => t.name === name);

    this.unwatch();
    fs.writeFile(templatePath, stringifyTemplate({ subject, body }), (err) => {
      this.watch();
      if (err) {
        this._displayError(err.message);
      }
      if (!template) {
        template = {
          id: filename,
          name: name,
          path: templatePath,
          subject: (subject || '').trim(),
        };
        this._items.unshift(template);
      } else {
        template.subject = (subject || '').trim();
      }
      if (callback) {
        callback(template);
      }
    });
  }

  _onDeleteTemplate(name: string) {
    const template = this._items.find((t) => t.name === name);
    if (!template) {
      return;
    }

    if (
      this._displayDialog(
        localized('Delete Template?'),
        localized('The template and its file will be permanently deleted.'),
        [localized('Delete'), localized('Cancel')]
      )
    ) {
      fs.unlink(template.path, () => {
        this._populate();
      });
    }
  }

  _onRenameTemplate(name: string, newName: string) {
    const template = this._items.find((t) => t.name === name);
    if (!template) {
      return;
    }

    if (newName.match(INVALID_TEMPLATE_NAME_REGEX)) {
      this._displayError(
        localized(
          'Invalid template name! Names can only contain letters, numbers, spaces, dashes, and underscores.'
        )
      );
      return;
    }
    if (newName.length === 0) {
      this._displayError(localized('You must provide a template name.'));
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

  async _onInsertTemplateId({
    templateId,
    headerMessageId,
  }: { templateId?: string; headerMessageId?: string } = {}) {
    const template = this._items.find((t) => t.id === templateId);
    const { subject: templateSubject, body: templateBody } = parseTemplate(
      fs.readFileSync(template.path).toString()
    );
    const session = await DraftStore.sessionForClientId(headerMessageId);
    const draft = session.draft();

    // Never touch the subject of a reply or a forward - the "Re:" / "Fwd:" prefix
    // and the original subject tie the message to the thread it came from. (The
    // composer doesn't even show the subject field when you're replying.)
    const canApplySubject =
      !!templateSubject && !draft.replyToHeaderMessageId && !draft.forwardedHeaderMessageId;
    const draftSubject = (draft.subject || '').trim();

    const bodyWouldBeReplaced = !draft.pristine && !draft.hasEmptyBody();
    const subjectWouldBeReplaced =
      canApplySubject && draftSubject.length > 0 && draftSubject !== templateSubject;

    let proceed = true;
    if (bodyWouldBeReplaced || subjectWouldBeReplaced) {
      proceed = this._displayDialog(
        localized('Replace draft contents?'),
        localized(
          'It looks like your draft already has some content. Loading this template will overwrite all draft contents.'
        ),
        [localized('Replace contents'), localized('Cancel')]
      );
    }

    if (proceed) {
      const current = draft.body;
      let insertion = current.length;
      for (const s of [
        '<signature',
        '<div class="gmail_quote_attribution"',
        '<blockquote class="gmail_quote"',
      ]) {
        const i = current.indexOf(s);
        if (i !== -1) {
          insertion = Math.min(insertion, i);
        }
      }
      const changes: { body: string; subject?: string } = {
        body: `${templateBody}${current.substr(insertion)}`,
      };
      if (canApplySubject) {
        changes.subject = templateSubject;
      }
      session.changes.add(changes);
    }
  }

  _welcomeTemplate(): Promise<{ name: string; path: string }> {
    const getTemplatePath = (name: string) => path.join(__dirname, '..', 'assets', `${name}.html`);
    let welcomeName = localized('Welcome to Templates');

    return new Promise((resolve, reject) => {
      fs.exists(getTemplatePath(welcomeName), (exists) => {
        if (!exists) {
          welcomeName = 'Welcome to Templates';
        }

        resolve({
          name: `${welcomeName}.html`,
          path: getTemplatePath(welcomeName),
        });
      });
    });
  }
}

export default new TemplateStore();
