import MenuManager from '../src/menu-manager';

describe('MenuManager', function () {
  let menu = null;

  beforeEach(function () {
    menu = new MenuManager({ resourcePath: AppEnv.getLoadSettings().resourcePath });
    menu.template = [];
  });

  describe('::add(items)', function () {
    it('can add new menus that can be removed with the returned disposable', function () {
      const disposable = menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      expect(menu.template).toEqual([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      disposable.dispose();
      expect(menu.template).toEqual([]);
    });

    it('can add submenu items to existing menus that can be removed with the returned disposable', function () {
      const disposable1 = menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      const disposable2 = menu.add([
        { label: 'A', submenu: [{ label: 'C', submenu: [{ label: 'D', command: 'd' }] }] },
      ]);
      const disposable3 = menu.add([
        { label: 'A', submenu: [{ label: 'C', submenu: [{ label: 'E', command: 'e' }] }] },
      ]);

      expect(menu.template).toEqual([
        {
          label: 'A',
          submenu: [
            { label: 'B', command: 'b' },
            {
              label: 'C',
              submenu: [
                { label: 'D', command: 'd' },
                { label: 'E', command: 'e' },
              ],
            },
          ],
        },
      ]);

      disposable3.dispose();
      expect(menu.template).toEqual([
        {
          label: 'A',
          submenu: [
            { label: 'B', command: 'b' },
            { label: 'C', submenu: [{ label: 'D', command: 'd' }] },
          ],
        },
      ]);

      disposable2.dispose();
      expect(menu.template).toEqual([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);

      disposable1.dispose();
      expect(menu.template).toEqual([]);
    });

    it('does not add duplicate labels to the same menu', function () {
      const originalItemCount = menu.template.length;
      menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      expect(menu.template[originalItemCount]).toEqual({
        label: 'A',
        submenu: [{ label: 'B', command: 'b' }],
      });
    });
  });

  describe('::setSectionMenu(menu)', function () {
    const calendar = { id: 'Calendar', label: 'Calendar', submenu: [] };
    const contact = { id: 'Contact', label: 'Contact', submenu: [] };
    const ids = () => menu.visibleTemplate().map((item) => item.id);

    beforeEach(function () {
      menu.template = ['File', 'Edit', 'View', 'Thread', 'Window'].map((id) => ({ id, label: id }));
    });

    it('shows the section menu after Edit, in place of View and Thread', function () {
      menu.setSectionMenu(calendar);
      expect(ids()).toEqual(['File', 'Edit', 'Calendar', 'Window']);
    });

    it('swaps one section menu for another without bringing back View and Thread', function () {
      menu.setSectionMenu(calendar);
      menu.setSectionMenu(contact);
      expect(ids()).toEqual(['File', 'Edit', 'Contact', 'Window']);
    });

    it('restores View and Thread where they were once no section menu shows', function () {
      menu.setSectionMenu(calendar);
      menu.setSectionMenu(null);
      expect(ids()).toEqual(['File', 'Edit', 'View', 'Thread', 'Window']);
    });
  });
});
