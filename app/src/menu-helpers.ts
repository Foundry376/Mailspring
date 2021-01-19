/*
 * decaffeinate suggestions:
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';

const ItemSpecificities = new WeakMap();

export type IMenuItem = {
  label?: string;
  submenu?: IMenuItem[];
  type?: 'separator';

  id?: string; //unlocalized label
  command?: string;
  enabled?: boolean;
  hideWhenDisabled?: boolean;
  visible?: boolean;
};

export function merge(menu: IMenuItem[], item: IMenuItem, itemSpecificity?: number) {
  let matchingItem;
  if (itemSpecificity == null) {
    itemSpecificity = Infinity;
  }
  item = cloneMenuItem(item);
  if (itemSpecificity) {
    ItemSpecificities.set(item, itemSpecificity);
  }
  const matchingItemIndex = findMatchingItemIndex(menu, item);
  if (matchingItemIndex !== -1) {
    matchingItem = menu[matchingItemIndex];
  }

  if (matchingItem != null) {
    if (item.submenu != null) {
      return item.submenu.map(submenuItem =>
        merge(matchingItem.submenu, submenuItem, itemSpecificity)
      );
    } else if (itemSpecificity) {
      if (!(itemSpecificity < ItemSpecificities.get(matchingItem))) {
        return (menu[matchingItemIndex] = item);
      }
    }
  } else if (item.type !== 'separator' || (_.last(menu) || ({} as any)).type !== 'separator') {
    return menu.push(item);
  }
}

export function unmerge(menu: IMenuItem[], item: IMenuItem) {
  let matchingItem;
  const matchingItemIndex = findMatchingItemIndex(menu, item);
  if (matchingItemIndex !== -1) {
    matchingItem = menu[matchingItemIndex];
  }

  if (matchingItem != null) {
    if (item.submenu != null) {
      for (const submenuItem of Array.from(item.submenu)) {
        unmerge(matchingItem.submenu, submenuItem);
      }
    }

    if (
      (matchingItem.submenu != null ? matchingItem.submenu : []).length === 0 ||
      matchingItem.isOptional
    ) {
      return menu.splice(matchingItemIndex, 1);
    }
  }
}

export function findMatchingItemIndex(menu: IMenuItem[], { type, label, submenu }: IMenuItem) {
  if (type === 'separator') {
    return -1;
  }
  for (let index = 0; index < menu.length; index++) {
    const item = menu[index];
    if (
      normalizeLabel(item.label) === normalizeLabel(label) &&
      (item.submenu != null) === (submenu != null)
    ) {
      return index;
    }
  }
  return -1;
}

export function normalizeLabel(label: string | null) {
  if (label == null) {
    return undefined;
  }

  if (process.platform === 'darwin') {
    return label;
  } else {
    return label.replace(/&/g, '');
  }
}

export function cloneMenuItem(item: IMenuItem) {
  item = { ...item };
  if (item.submenu != null) {
    item.submenu = item.submenu.map(submenuItem => cloneMenuItem(submenuItem));
  }
  return item;
}

export function forEachMenuItem(menu: IMenuItem[], callback: (item: IMenuItem) => void) {
  const result = [];
  for (const item of Array.from(menu)) {
    if (item.submenu != null) {
      forEachMenuItem(item.submenu, callback);
    }
    result.push(callback(item));
  }
  return result;
}
