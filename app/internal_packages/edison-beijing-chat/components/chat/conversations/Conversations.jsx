import React, { PureComponent } from 'react'
import { ChatActions, ConversationStore } from 'chat-exports'
import PropTypes from 'prop-types'
import ConversationItem from './ConversationItem'
import { WorkspaceStore, Actions } from 'mailspring-exports'
export default class Conversations extends PureComponent {
  static propTypes = {
    referenceTime: PropTypes.number
  }

  static defaultProps = {
    referenceTime: new Date().getTime()
  }

  constructor (props) {
    super(props)
    this.state = {
      selectedConversation: null,
      conversations: null
    }
    this._listenToStore()
  }

  _listenToStore = () => {
    this._unsub = ConversationStore.listen(this._onDataChanged)
  }

  componentWillUnmount () {
    this._unsub()
  }

  _onDataChanged = async () => {
    const selectedConversation = await ConversationStore.getSelectedConversation()
    const conversations = await ConversationStore.getConversations()
    this.setState({
      selectedConversation,
      conversations
    })
  }

  render () {
    const { referenceTime } = this.props

    const { selectedConversation, conversations } = this.state
    if (!conversations || conversations.length === 0) {
      return <div className='noConversations' />
    }
    conversations.sort((x, y) => {
      if (+x.lastMessageTime > +y.lastMessageTime) {
        return -1
      } else if (+x.lastMessageTime < +y.lastMessageTime) {
        return 1
      } else {
        if (x.name < y.name) {
          return -1
        } else if (x.name > y.name) {
          return 1
        } else {
          return 0
        }
      }
    })

    return (
      <div onClick={() => Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView)}>
        {conversations.map(conv => (
          <ConversationItem
            key={conv.jid}
            selected={selectedConversation && selectedConversation.jid === conv.jid}
            conversation={conv}
            referenceTime={referenceTime}
            onClick={() => ChatActions.selectConversation(conv.jid)}
          />
        ))}
      </div>
    )
  }
}
