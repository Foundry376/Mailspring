import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import FilePlusIcon from '../../common/icons/FilePlusIcon';
import SendIcon from '../../common/icons/SendIcon';
import { theme } from '../../../utils/colors';
import { uploadFile } from '../../../utils/awss3';
import RetinaImg from '../../../../../../src/components/retina-img';
import Mention, { toString, getMentions } from 'rc-editor-mention';
import xmpp from '../../../xmpp';
import uuid from 'uuid/v4';
import TextArea from 'react-autosize-textarea';

const FAKE_SPACE = '\u00A0';

const activeStyle = {
  transform: 'scaleY(1)',
  transition: 'all 0.25s cubic-bezier(.3,1.2,.2,1)',
  zIndex: 9999
};

const disableStyle = {
  transform: 'scaleY(0)',
  transition: 'all 0.25s cubic-bezier(.3,1,.2,1)',
};

const platform = require('electron-platform')
const { clipboard } = require('electron');
const plist = require('plist');

//linux is not implemented because no method was found after googling a lot
// only be tested on mac, not be tested on Windows
//https://github.com/electron/electron/issues/9035
function getClipboardFiles() {
  if (platform.isDarwin) {
    if (!clipboard.has('NSFilenamesPboardType')) {
      // this check is neccessary to prevent exception while no files is copied
      return [];
    } else {
      return plist.parse(clipboard.read('NSFilenamesPboardType'));
    }
  } else if (platform.isWin32) {
    clipboard.readBuffer('FileNameW').replace(RegExp(String.fromCharCode(0), 'g'), '');
  }
}

export default class MessagesSendBar extends PureComponent {
  static propTypes = {
    onMessageSubmitted: PropTypes.func.isRequired,
    selectedConversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      isGroup: PropTypes.bool.isRequired
    }).isRequired,
  }

  static defaultProps = {
    selectedConversation: null
  }

  state = {
    messageBody: '',
    files: [],
    suggestions: [],
    suggestionStyle: activeStyle,
    roomMembers: [],
    occupants: []
  }

  fileInput = null;
  textarea = null;

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    const occupants = roomMembers.map(item => item.jid.bare);
    this.setState({
      roomMembers,
      occupants
    })
  }

  getRoomMembers = async () => {
    const { selectedConversation } = this.props;
    const { roomMembers } = this.state;
    if (selectedConversation.isGroup) {
      if (roomMembers && roomMembers.length) {
        return roomMembers;
      }
      const result = await xmpp.getRoomMembers(selectedConversation.jid, null, selectedConversation.curJid)
      return result.mucAdmin.items;
    }
    return [];
  }

  onMessageBodyKeyPressed(event) {
    const { nativeEvent } = event;
    if (nativeEvent.keyCode === 13 && !nativeEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      return false;
    }
    return true;
  }

  // onMessageBodyChanged = (editorState) => {
  //   const messageBody = toString(editorState, { encode: true });
  //   this.setState({
  //     messageBody
  //   });
  // }

  onMessageBodyChanged = (e) => {
    const messageBody = e.target.value;
    this.setState({
      messageBody
    });
  }

  getAtTargetPersons = () => {
    const { messageBody, roomMembers } = this.state;
    const { selectedConversation } = this.props;
    if (!selectedConversation.isGroup) {
      return [];
    }
    const atJids = [];
    let atPersonNames = messageBody.match(/@[^ ]+ |@[^ ]+$/g);

    if (atPersonNames) {
      atPersonNames = atPersonNames.map(item => {
        return item.trim().substr(1).replace(/&nbsp;/g, ' ')
      });
      for (const name of atPersonNames) {
        for (const member of roomMembers) {
          if (member.name === name) {
            atJids.push(member.jid.bare);
            break;
          }
        }
      }
    }
    return atJids;
  }

  sendMessage() {
    let { messageBody, occupants } = this.state;
    messageBody = messageBody.replace(/&nbsp;|<br \/>/g, ' ');
    const { selectedConversation, onMessageSubmitted } = this.props;
    const atIndex = selectedConversation.jid.indexOf('@')
    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    if (!selectedConversation) {
      return;
    }

    if (this.state.files.length) {
      this.state.files.map((file, index) => {
        let message;
        if (index === 0) {
          message = messageBody.trim();
        } else {
          message = 'file received';
        }
        let body = {
          type: 1,
          timeSend: new Date().getTime(),
          content: 'sending...',
          email: selectedConversation.email,
          name: selectedConversation.name,
          mediaObjectId: '',
        };
        const messageId = uuid();
        onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, true);
        uploadFile(jidLocal, null, file, (err, filename, myKey, size) => {
          if (err) {
            alert(`upload files failed because error: ${err}, filename: ${filename}`);
            return;
          }
          if (filename.match(/.gif$/)){
            body.type = 5;
          } else if (filename.match(/(\.bmp|\.png|\.jpg|\.jpeg)$/)){
            body.type = 2;
          } else {
            body.type = 9;
          }
          body.content = message || " ";
          body.mediaObjectId = myKey;
          body.occupants = occupants;
          body.atJids = this.getAtTargetPersons();
          body.localFile = file;
          onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, false);
        });
      })
    } else {
      let message = messageBody.trim();
      if (message) {
        let body = {
          type: 1,
          timeSend: new Date().getTime(),
          content: message,
          email: selectedConversation.email,
          name: selectedConversation.name,
          occupants,
          atJids: this.getAtTargetPersons()
        };
        onMessageSubmitted(selectedConversation, JSON.stringify(body));//message);
      }

    }
    this.setState({ messageBody: '', files: [] });
    // this.refs.mention.reset();
  }

  onFileChange = event => {
    let state,
      files = [];
    // event.target.files is type FileList
    // it need be converted to Array  to use this.state.files.map(...) in jsx
    for (let file of event.target.files) {
      files.push(file.path);
    }
    state = Object.assign({}, this.state, { files });
    this.setState(state, () => {
      this.sendMessage();
    });
    event.target.value = '';
    // event.target.files = new window.FileList();
  };

  onDrop = (e) => {
    let tranFiles = e.dataTransfer.files,
      files = this.state.files.slice();
    for (let i = 0; i++; i < tranFiles.length) {
      files.push(tranFiles[i].path);
    }
    this.setState(Object.assign({}, this.state, { files }));
  };

  onKeyDown = (e) => {
    if (e.keyCode === 86 && (e.ctrlKey || e.metaKey)) {
      let files;
      // try-catch is neccessary to prevent exception
      // while the clipboard is containing files copied from non standard system application(e.g. webstorm)
      try {
        files = getClipboardFiles();
      }
      catch (e) {
      }
      if (!files || files.length === 0) {
        return true;
      }
      files = this.state.files.concat(files);
      this.setState(Object.assign({}, this.state, { files }), () => {
        this.sendMessage();
      });
      e.preventDefault();
      e.stopPropagation();
    } else if (e.keyCode == 13 && (e.ctrlKey || e.metaKey)) {
      this.sendMessage();
      e.preventDefault();
      e.stopPropagation();
    }
  };

  clearFiles = (e) => {
    this.setState(Object.assign({}, this.state, { files: [] }));
  };

  onSearchChange = (value) => {
    const { selectedConversation } = this.props;
    if (!selectedConversation.isGroup) {
      return;
    }
    const { roomMembers } = this.state;
    const searchValue = value.toLowerCase();
    const memberNames = roomMembers.map(item => item.name.replace(/ /g, FAKE_SPACE));
    const filtered = memberNames.filter(item =>
      item.toLowerCase().indexOf(searchValue) !== -1
    );
    this.setState({
      suggestions: filtered,
      suggestionStyle: filtered.length ? activeStyle : disableStyle
    });
  }

  render() {
    const { suggestions, suggestionStyle } = this.state;
    return (
      <div className="sendBar" onDrop={this.onDrop}>
        {/* <Mention
            style={{ width: '100%', height: '70px' }}
            multiLines={true}
            onChange={this.onMessageBodyChanged}
            onSearchChange={this.onSearchChange}
            suggestions={suggestions}
            suggestionStyle={suggestionStyle}
            prefixCls="rc-editor-mention"
            notFoundContent="could not find"
            ref="mention"
            prefix="@"
          /> */}
        <TextArea
          className="messageTextField"
          placeholder="Edison Chat"
          rows={1}
          maxRows={5}
          value={this.state.messageBody}
          onChange={this.onMessageBodyChanged.bind(this)}
          onKeyPress={this.onMessageBodyKeyPressed.bind(this)}
          ref={element => { this.textarea = element; }}
          onKeyDown={this.onKeyDown}
        />
        <div className="chat-message-filelist">
          {this.state.files.map((file, index) => {
            const removeFile = (e) => {
              let files = this.state.files;
              index = files.indexOf(file);
              files.splice(index, 1);
              files = files.slice();
              this.setState(Object.assign({}, this.state, { files }));
            };
            return (
              <div id='remove-file' key={index} onClick={removeFile} title={file}>
                <RetinaImg
                  name="fileIcon.png"
                  mode={RetinaImg.Mode.ContentPreserve}
                  key={index}
                />
                <div id='remove-file-inner' title="remove this file from the list">
                  -
                  </div>
              </div>
            );
          })
          }
          {this.state.files.length ?
            <div id="clear-all-files" title="clear all files from the list" onClick={this.clearFiles}> X </div> :
            null
          }
        </div>
        <div className="sendBarActions">
          <Button
            className='no-border'
            onTouchTap={() => {
              this.fileInput.click();
            }}
          >
            <FilePlusIcon className="icon" />
            <input
              style={{ display: 'none' }}
              ref={element => { this.fileInput = element; }}
              type="file"
              multiple
              onChange={this.onFileChange}
            />
          </Button>
        </div>
      </div>
    );
  }
}
