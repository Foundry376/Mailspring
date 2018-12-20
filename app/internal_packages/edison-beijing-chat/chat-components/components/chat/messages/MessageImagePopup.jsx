import React, { Component } from 'react';
import messageModel from './messageModel'
import { buildTimeDescriptor } from '../../../utils/time';
import { downloadFile } from '../../../utils/awss3';
import { isJsonString } from '../../../utils/stringUtils';
import CancelIcon from '../../common/icons/CancelIcon';
import Button from '../../common/Button';
const { dialog } = require('electron').remote;

var http = require("http");
var https = require("https");
var fs = require("fs");

let key = 0;
export default class MessageImagePopup extends Component {
  constructor() {
    super();
    messageModel.imagePopup = this;
  }
  update() {
    this.setState(Object.assign({}, this.state, { key: key++ }));
  }
  getContactNameByJid(jid) {
    this.props = messageModel.messagesReactInstance.props;
    if (this.props.selectedConversation.isGroup) {
      const members = this.props.members;
      if (!members || members.length === 0) {
        return null;
      }
      for (const member of members) {
        if (member.jid.bare === jid) {
          return member.name;
        }
      }
    }
    return null;
  }
  downloadImage = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const msgBody = messageModel.msgBody;
    let path = dialog.showSaveDialog({ title: `download file` });
    if (!path || typeof path !== 'string') {
      return;
    }
    if (msgBody.path.match(/^file:\/\//)) {
      console.log('downloadImage: ', msgBody.path);
      let imgpath = msgBody.path.replace('file://', '');
      fs.copyFileSync(imgpath, path);
    } else if (!msgBody.mediaObjectId.match(/^https?:\/\//)) {
      // the file is on aws
      downloadFile(msgBody.aes, msgBody.mediaObjectId, path);
    } else {
      let request;
      if (msgBody.mediaObjectId.match(/^https/)) {
        request = https;
      } else {
        request = http;
      }
      request.get(msgBody.mediaObjectId, function (res) {
        var imgData = '';
        res.setEncoding('binary');
        res.on('data', function (chunk) {
          imgData += chunk;
        });
        res.on('end', function () {
          fs.writeFile(path, imgData, 'binary', function (err) {
            if (err) {
              console.log('down fail');
            }
            console.log('down success');
          });
        });
      });
    }
  }
  gotoPrevImage = (event) => {
    const groupedMessages = messageModel.messagesReactInstance.props.groupedMessages;
    let group = messageModel.group;
    let groupIndex = groupedMessages.indexOf(group);
    let msg = messageModel.msg;
    let index = group.messages.indexOf(msg);
    while (1) {
      while (index) {
        index--;
        msg = group.messages[index];
        let msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
        if (msgBody.path) {
          messageModel.group = group;
          messageModel.msg = msg;
          messageModel.msgBody = msgBody;
          this.update();
          return;
        }
      }
      if (groupIndex) {
        groupIndex--;
        group = groupedMessages[groupIndex];
        index = group.messages.length;
      } else {
        break;
      }
    }
  }
  gotoNextImage = (event) => {
    const groupedMessages = messageModel.messagesReactInstance.props.groupedMessages;
    let group = messageModel.group;
    let groupIndex = groupedMessages.indexOf(group);
    let msg = messageModel.msg
    let index = group.messages.indexOf(msg);
    while (1) {
      while (index < group.messages.length - 1) {
        index++;
        msg = group.messages[index];
        let msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
        if (msgBody.path) {
          messageModel.group = group;
          messageModel.msg = msg;
          messageModel.msgBody = msgBody;
          this.update();
          return;
        }
      }
      if (groupIndex < groupedMessages.length - 1) {
        groupIndex++;
        group = groupedMessages[groupIndex];
        index = -1;
      } else {
        break;
      }
    }
  }

  render() {
    const {
      referenceTime,
    } = this.props;

    const timeDescriptor = buildTimeDescriptor(referenceTime);
    if (this.hidden || !messageModel.msg) {
      return null;
    }
    let msg = messageModel.msg;
    let msgBody = messageModel.msgBody;

    return (
      <div className='message-image-popup'>
        <div className='message-image-popup-toolbar'>
          <Button id='close-button' className="no-border" onTouchTap={() => { this.hidden = true; this.update(); }}>
            <CancelIcon color={"#787e80"} />
          </Button>
          {true || msg.sender !== messageModel.currentUserId ?
            <div className="messageSender image-popup-avatar" style={{ display: 'inline-block' }}>
              {messageModel.messagesReactInstance.getContactInfoByJid(msg.sender)}
            </div> : null
          }
          <div style={{ display: 'inline-block' }}>
            <span style={{ display: 'inline-block', width: '100%' }}>{ msgBody.localFile || msgBody.mediaObjectId.replace(/\.encrypted$/, '') }</span>
            <span>{this.getContactNameByJid(msg.sender)} &nbsp; {timeDescriptor(msg.sentTime, true)}</span>
          </div>
          <span className="download-img" style={{ float: 'right' }} onClick={this.downloadImage}></span>
        </div>
        <div className='message-image-popup-content'>
          <div className="left-span">
            <span className='left-arrow-button' onClick={this.gotoPrevImage}></span>
          </div>
          <div className="img-container">
            <img src={msgBody.path} />
          </div>
          <div className="right-span">
            <span className='right-arrow-button' onClick={this.gotoNextImage}></span>
          </div>
        </div>
      </div>
    )
  }
}

