import React from 'react';
import { PropTypes, FocusedContentStore, Actions } from 'mailspring-exports';
import { FluxContainer } from 'mailspring-component-kit';

type FocusContainerProps = {
  collection?: string;
  children: React.ReactElement<any>;
};
export default class FocusContainer extends React.Component<FocusContainerProps> {
  static displayName = 'FocusContainer';
  static propTypes = {
    children: PropTypes.element,
    collection: PropTypes.string,
  };

  getStateFromStores = () => {
    const { collection } = this.props;
    return {
      focused: (FocusedContentStore as any).focused(collection),
      focusedId: (FocusedContentStore as any).focusedId(collection),
      keyboardCursor: (FocusedContentStore as any).keyboardCursor(collection),
      keyboardCursorId: (FocusedContentStore as any).keyboardCursorId(collection),
      onFocusItem: item => Actions.setFocus({ collection: collection as any, item: item }),
      onSetCursorPosition: item =>
        Actions.setCursorPosition({ collection: collection as any, item: item }),
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
