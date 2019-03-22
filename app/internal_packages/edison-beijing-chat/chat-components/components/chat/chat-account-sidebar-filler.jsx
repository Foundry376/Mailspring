import React, { PureComponent } from 'react';
import { Actions } from 'mailspring-exports';
export default class ChatAccountSidebarFiller extends PureComponent {
  static displayName = 'ChatAccountSidebarFiller';

  constructor(props) {
    super(props);
    this.selfNode = null;
    this.state = {
      selfHeight: 300,
      devMode: AppEnv.getLoadSettings()
    };
    this.unlistener = Actions.updateChatPanelHeight.listen(this.setHeight, this);
  }

  componentDidMount() {
    const leftPanel = document.querySelector('.chat-left-panel-container')
    if(leftPanel){
      this.setHeight(leftPanel.getBoundingClientRect().top);
    }else{
      this.setHeight(AppEnv.config.get(`chatPanelHeight`));
    }
  }
  componentWillUnmount() {
    this.unlistener();
  }

  setHeight(top) {
    const body = document.querySelector('mailspring-workspace');
    this.setState({ selfHeight: body.getBoundingClientRect().height-top });
  }

  render() {
    return <div className='chat-account-sidebar-filler' ref={ref => this.selfNode = ref}
                style={{ height: this.state.selfHeight }}/>;
  }
}