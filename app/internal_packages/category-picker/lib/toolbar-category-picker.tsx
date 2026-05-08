import React, { useContext, useMemo, useRef, useCallback } from 'react';
import {
  localized,
  Actions,
  AccountStore,
  WorkspaceStore,
  SheetDepthContext,
  Thread,
} from 'mailspring-exports';
import { RetinaImg, KeyCommandsRegion, RovingTabIndexToolbar } from 'mailspring-component-kit';

import MovePickerPopover from './move-picker-popover';
import LabelPickerPopover from './label-picker-popover';

// This sets the folder / label on one or more threads.
const MovePicker: React.FC<{ items: Thread[] }> & { containerRequired?: boolean } = ({ items }) => {
  const sheetDepth = useContext(SheetDepthContext);
  const moveEl = useRef<HTMLButtonElement>(null);
  const labelEl = useRef<HTMLButtonElement>(null);

  // If the threads we're picking categories for change, (like when they
  // get their categories updated), we expect our parents to pass us new
  // props. We don't listen to the DatabaseStore ourselves.
  const account = useMemo(() => AccountStore.accountForItems(items), [items]);

  const onOpenMovePopover = useCallback(() => {
    if (items.length === 0) return;
    if (sheetDepth !== WorkspaceStore.sheetStack().length - 1) return;
    Actions.openPopover(<MovePickerPopover threads={items} account={account} />, {
      originRect: moveEl.current.getBoundingClientRect(),
      direction: 'down',
    });
  }, [items, account, sheetDepth]);

  const onOpenLabelsPopover = useCallback(() => {
    if (items.length === 0) return;
    if (sheetDepth !== WorkspaceStore.sheetStack().length - 1) return;
    Actions.openPopover(<LabelPickerPopover threads={items} account={account} />, {
      originRect: labelEl.current.getBoundingClientRect(),
      direction: 'down',
    });
  }, [items, account, sheetDepth]);

  if (!account) {
    return <span />;
  }

  const handlers: Record<string, () => void> = {
    'core:change-folders': onOpenMovePopover,
  };
  if (account.usesLabels()) {
    handlers['core:change-labels'] = onOpenLabelsPopover;
  }

  return (
    <RovingTabIndexToolbar
      label={localized('Category Actions')}
      className="button-group"
      style={{ order: -103 }}
    >
      <KeyCommandsRegion globalHandlers={handlers}>
        <button
          tabIndex={-1}
          ref={moveEl}
          title={localized('Move to Folder')}
          aria-label={localized('Move to Folder')}
          onClick={onOpenMovePopover}
          className={'btn btn-toolbar btn-category-picker'}
        >
          <RetinaImg
            name={'toolbar-movetofolder.png'}
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </button>
        {account.usesLabels() && (
          <button
            tabIndex={-1}
            ref={labelEl}
            title={localized('Apply Label')}
            aria-label={localized('Apply Label')}
            onClick={onOpenLabelsPopover}
            className={'btn btn-toolbar btn-category-picker'}
          >
            <RetinaImg
              name={'toolbar-tag.png'}
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        )}
      </KeyCommandsRegion>
    </RovingTabIndexToolbar>
  );
};
MovePicker.displayName = 'MovePicker';
MovePicker.containerRequired = false;

export default MovePicker;
