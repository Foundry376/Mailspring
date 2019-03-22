import React, { PureComponent } from 'react';
import { Actions } from 'mailspring-exports';
export default class ChatAccountSidebarFiller extends PureComponent {
  static displayName = 'ChatAccountSidebarFiller';

  constructor(props) {
    super(props);
    this.selfNode = null;
    this.state = {
      selfHeight: 300,
      expand: 1,
    };
    this.unlisteners = [
      Actions.updateChatPanelHeight.listen(this.setHeight, this),
      Actions.expandChatPanelFiller.listen(this.expandFiller, this)
    ];
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
    for(let unlisten of this.unlisteners){
      unlisten();
    }
  }
  expandFiller=(expand)=>{
    this.setState({expand: expand ? 1 : 0});
  }

  setHeight=(top)=> {
    const body = document.querySelector('mailspring-workspace');
    this.setState({ selfHeight: ((body.getBoundingClientRect().height-top)>0)* (body.getBoundingClientRect().height-top)});
  }

  render() {
    return <div className='chat-account-sidebar-filler' ref={ref => this.selfNode = ref}
                style={{ height: this.state.expand * this.state.selfHeight }}/>;
  }
}