import { MailboxPerspective } from 'mailspring-exports';

export interface ISidebarItem {
  id: string;
  name: string;
  contextMenuLabel: string;
  count: number;
  iconName: string;
  children: ISidebarItem[];
  perspective: MailboxPerspective;
  selected: boolean;
  collapsed: boolean;
  counterStyle: string;
  onDelete?: () => void;
  onEdited?: () => void;
  onCollapseToggled: () => void;
  onDrop: (item, event) => void;
  shouldAcceptDrop: (item, event) => void;
  onSelect: (item) => void;

  deletable?: boolean;
  editable?: boolean;
}

export interface ISidebarSection {
  title: string;
  items: ISidebarItem[];
  iconName?: string;
  collapsed?: boolean;
  onCollapseToggled?: () => void;
  onItemCreated?: (displayName) => void;
}
