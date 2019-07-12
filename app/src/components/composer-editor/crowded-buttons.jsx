import React from 'react';
import { Actions } from 'mailspring-exports';
import { Divider } from './base-mark-plugins';
import { BLOCK_CONFIG } from './base-block-plugins';
import { BuildToggleButton } from './toolbar-component-factories';
import MoreComposerButtonsPopover from './more-composer-buttons-popover';
import RetinaImg from '../retina-img';

const CrowdedButton = ({ value, onChange, isCrowded = false }) => {
  if(!isCrowded){
    return [];
  }
  const buttons = [
    {
      toolbarComponents: Object.values(BLOCK_CONFIG)
        .filter(m => m.button)
        .map(BuildToggleButton),
    },
  ];
  const closePopover = () =>{
    Actions.closePopover();
  };
  const _onChange = value => {
    Actions.closePopover();
    setTimeout(() => {
      onChange(value.focus());
    });
  };
  return [
    <Divider key="more_buttons_divider" />,
    <button
      key="more_buttons"
      className="show-when-crowded pull-right"
      onClick={e => {
        Actions.openPopover(<MoreComposerButtonsPopover buttons={buttons} value={value} onChange={_onChange} closePopover={closePopover} anchorEl={e.target.getBoundingClientRect()}/>, {
          originRect: e.target.getBoundingClientRect(),
          direction: 'down',
          closeOnAppBlur: true
        });
      }}
    >
      <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
    </button>
  ];
};

export default [
  {
    toolbarComponents: [CrowdedButton],
  },
];
