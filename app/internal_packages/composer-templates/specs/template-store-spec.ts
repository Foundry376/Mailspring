import fs from 'fs';
import { DraftStore, Message } from 'mailspring-exports';
import TemplateStore from '../lib/template-store';

const TEMPLATE = {
  id: 'Follow Up.html',
  name: 'Follow Up',
  path: '/tmp/templates/Follow Up.html',
  subject: 'Following up on our call',
};

const TEMPLATE_FILE = `<meta name="subject" content="Following up on our call"/>\n<div>Hey!</div>`;

describe('TemplateStore', function templateStore() {
  describe('inserting a template into a draft', () => {
    let session = null;
    let draft = null;

    const insert = async (draftProps, fileContents = TEMPLATE_FILE) => {
      draft = new Message({ draft: true, pristine: true, subject: '', body: '', ...draftProps });
      session = { draft: () => draft, changes: { add: jasmine.createSpy('add') } };
      spyOn(fs, 'readFileSync').andReturn(fileContents);
      spyOn(DraftStore, 'sessionForClientId').andReturn(Promise.resolve(session));
      await (TemplateStore as any)._onInsertTemplateId({
        templateId: TEMPLATE.id,
        headerMessageId: 'draft-1',
      });
      return session.changes.add.calls.length ? session.changes.add.mostRecentCall.args[0] : null;
    };

    beforeEach(() => {
      (TemplateStore as any)._items = [TEMPLATE];
      spyOn(TemplateStore as any, '_displayDialog').andReturn(true);
    });

    it("fills in the draft's subject and body when the draft has no subject", async () => {
      const changes = await insert({});
      expect(changes.subject).toBe('Following up on our call');
      expect(changes.body).toBe('<div>Hey!</div>');
      expect((TemplateStore as any)._displayDialog).not.toHaveBeenCalled();
    });

    it('leaves the subject alone when the template does not have one', async () => {
      const changes = await insert({}, '<div>Hey!</div>');
      expect(changes.subject).toBe(undefined);
      expect(changes.body).toBe('<div>Hey!</div>');
    });

    it('never replaces the subject of a reply', async () => {
      const changes = await insert({
        subject: 'Re: Lunch tomorrow',
        replyToHeaderMessageId: 'other-message',
      });
      expect(changes.subject).toBe(undefined);
      expect((TemplateStore as any)._displayDialog).not.toHaveBeenCalled();
    });

    it('never replaces the subject of a forward', async () => {
      const changes = await insert({
        subject: 'Fwd: Lunch tomorrow',
        forwardedHeaderMessageId: 'other-message',
      });
      expect(changes.subject).toBe(undefined);
      expect((TemplateStore as any)._displayDialog).not.toHaveBeenCalled();
    });

    it('asks before replacing a subject the draft already has', async () => {
      const changes = await insert({ subject: 'Lunch tomorrow' });
      expect((TemplateStore as any)._displayDialog).toHaveBeenCalled();
      expect(changes.subject).toBe('Following up on our call');
    });

    it('does not ask when the draft subject already matches the template', async () => {
      const changes = await insert({ subject: 'Following up on our call' });
      expect((TemplateStore as any)._displayDialog).not.toHaveBeenCalled();
      expect(changes.subject).toBe('Following up on our call');
    });

    it('makes no changes when the user cancels the replacement', async () => {
      (TemplateStore as any)._displayDialog.andReturn(false);
      const changes = await insert({ subject: 'Lunch tomorrow' });
      expect(changes).toBe(null);
    });

    it('inserts the body above the signature and quoted text', async () => {
      const changes = await insert({
        body: '<div>draft</div><signature>Ben</signature>',
        pristine: false,
      });
      expect(changes.body).toBe('<div>Hey!</div><signature>Ben</signature>');
    });
  });

  describe('creating a template from a draft', () => {
    const createFromDraft = async (draftProps) => {
      const draft = new Message({
        draft: true,
        subject: '',
        body: '<div>Hey there!</div>',
        ...draftProps,
      });
      spyOn(DraftStore, 'sessionForClientId').andReturn(Promise.resolve({ draft: () => draft }));
      spyOn(TemplateStore as any, 'saveNewTemplate');
      await (TemplateStore as any)._onCreateTemplateFromDraft('draft-1');
      const spy = (TemplateStore as any).saveNewTemplate;
      return spy.calls.length
        ? { name: spy.mostRecentCall.args[0], ...spy.mostRecentCall.args[1] }
        : null;
    };

    it("keeps the draft's subject as the template subject", async () => {
      const saved = await createFromDraft({ subject: 'Following up on our call' });
      expect(saved.name).toBe('Following up on our call');
      expect(saved.subject).toBe('Following up on our call');
    });

    it('does not carry over the subject of a reply', async () => {
      const saved = await createFromDraft({
        subject: 'Re: Lunch tomorrow',
        replyToHeaderMessageId: 'other-message',
      });
      expect(saved.name).toBe('Re Lunch tomorrow');
      expect(saved.subject).toBe('');
    });

    it('does not carry over the subject of a forward', async () => {
      const saved = await createFromDraft({
        subject: 'Fwd: Q3 numbers',
        forwardedHeaderMessageId: 'other-message',
      });
      expect(saved.subject).toBe('');
    });
  });
});
