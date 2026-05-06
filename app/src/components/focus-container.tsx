import React from 'react';
import { FocusedContentStore, Actions } from 'mailspring-exports';
import { FluxContainer } from 'mailspring-component-kit';

type FocusContainerProps = {
  collection?: string;
  children: React.ReactElement<any>;
};
export default class FocusContainer extends React.Component<FocusContainerProps> {
  static displayName = 'FocusContainer';

  getStateFromStores = () => {
    const { collection } = this.props;
    return {
      focused: FocusedContentStore.focused(collection),
      focusedId: FocusedContentStore.focusedId(collection),
      keyboardCursor: FocusedContentStore.keyboardCursor(collection),
      keyboardCursorId: FocusedContentStore.keyboardCursorId(collection),
      onFocusItem: (item: any) => Actions.setFocus({ collection, item }),
      onSetCursorPosition: (item: any) => Actions.setCursorPosition({ collection, item }),
    };
  };

  render() {
    return (
      <FluxContainer
        {...this.props}
        stores={[FocusedContentStore]}
        getStateFromStores={this.getStateFromStores}
      >
        {this.props.children}
      </FluxContainer>
    );
  }
}
