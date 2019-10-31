import { React, PropTypes, FocusedContentStore, Actions } from 'mailspring-exports';
import { FluxContainer } from 'mailspring-component-kit';

export default class FocusContainer extends React.Component {
  static displayName = 'FocusContainer';
  static propTypes = {
    children: PropTypes.element,
    collection: PropTypes.string,
    onFocusItem: PropTypes.func,
    onSetCursorPosition: PropTypes.func,
  };

  getStateFromStores = () => {
    const { collection } = this.props;
    let onFocusItem = item => Actions.setFocus({ collection: collection, item: item });
    let onSetCursorPosition = item => {
      Actions.setCursorPosition({ collection: collection, item: item });
    };
    if (this.props.onFocusItem) {
      onFocusItem = this.props.onFocusItem;
    }
    if (this.props.onSetCursorPosition) {
      onSetCursorPosition = this.props.onSetCursorPosition;
    }
    return {
      focused: FocusedContentStore.focused(collection),
      focusedId: FocusedContentStore.focusedId(collection),
      keyboardCursor: FocusedContentStore.keyboardCursor(collection),
      keyboardCursorId: FocusedContentStore.keyboardCursorId(collection),
      onFocusItem,
      onSetCursorPosition,
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
