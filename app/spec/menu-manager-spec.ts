import MenuManager from '../src/menu-manager';

describe('MenuManager', function() {
  let menu = null;

  beforeEach(function() {
    menu = new MenuManager({ resourcePath: AppEnv.getLoadSettings().resourcePath });
    menu.template = [];
  });

  describe('::add(items)', function() {
    it('can add new menus that can be removed with the returned disposable', function() {
      const disposable = menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      expect(menu.template).toEqual([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      disposable.dispose();
      expect(menu.template).toEqual([]);
    });

    it('can add submenu items to existing menus that can be removed with the returned disposable', function() {
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
            { label: 'C', submenu: [{ label: 'D', command: 'd' }, { label: 'E', command: 'e' }] },
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

    it('does not add duplicate labels to the same menu', function() {
      const originalItemCount = menu.template.length;
      menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      menu.add([{ label: 'A', submenu: [{ label: 'B', command: 'b' }] }]);
      expect(menu.template[originalItemCount]).toEqual({
        label: 'A',
        submenu: [{ label: 'B', command: 'b' }],
      });
    });
  });
});
