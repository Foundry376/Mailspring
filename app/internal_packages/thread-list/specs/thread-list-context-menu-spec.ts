import {
  Thread,
  Folder,
  Actions,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  TaskFactory,
} from 'mailspring-exports';
import ThreadListContextMenu from '../lib/thread-list-context-menu';

function threadIn(role: string) {
  return new Thread({
    id: `t-${role}`,
    accountId: TEST_ACCOUNT_ID,
    subject: 'Hello',
    folders: [new Folder({ id: `f-${role}`, accountId: TEST_ACCOUNT_ID, role })],
    labels: [],
    participants: [],
  });
}

async function labelsFor(threads: Thread[], perspective = null) {
  spyOn(DatabaseStore, 'modelify').andReturn(Promise.resolve(threads));
  const menu = new ThreadListContextMenu({
    threadIds: threads.map((t) => t.id),
    accountIds: [TEST_ACCOUNT_ID],
    perspective,
    source: 'Spec',
  });
  const template = await menu.menuItemTemplate();
  return { menu, template, labels: template.map((item: any) => item.label).filter(Boolean) };
}

describe('ThreadListContextMenu without a perspective', function () {
  beforeEach(() => {
    spyOn(AccountStore, 'accountsForItems').andReturn([{ canArchiveThreads: () => true } as any]);
    spyOn(CategoryStore, 'getCategoryByRole').andReturn(new Folder({ role: 'trash' }));
    spyOn(Actions, 'queueTasks');
  });

  it('offers Archive only when a thread is in the inbox', async () => {
    expect((await labelsFor([threadIn('inbox')])).labels).toContain('Archive');
    jasmine.unspy(DatabaseStore, 'modelify');
    expect((await labelsFor([threadIn('archive')])).labels).not.toContain('Archive');
  });

  it('offers Trash unless every thread is already in the trash', async () => {
    expect((await labelsFor([threadIn('archive')])).labels).toContain('Trash');
    jasmine.unspy(DatabaseStore, 'modelify');
    expect((await labelsFor([threadIn('trash')])).labels).not.toContain('Trash');
  });

  it('archives without scoping the move to a source folder', async () => {
    spyOn(TaskFactory, 'tasksForArchiving').andReturn([]);
    const { template } = await labelsFor([threadIn('inbox')]);
    (template.find((item: any) => item.label === 'Archive') as any).click();
    const args = (TaskFactory.tasksForArchiving as jasmine.Spy).mostRecentCall.args[0];
    expect(args.perspective).toBe(null);
    expect(args.source).toBe('Spec');
  });
});
