import React, { Component } from 'react';
import { FILE_TYPE } from '../../../utils/filetypes';
import { buildTimeDescriptor } from '../../../utils/time';
import { downloadFile } from '../../../utils/awss3';
import { isJsonString } from '../../../utils/stringUtils';
const { dialog } = require('electron').remote;
import { RetinaImg } from 'mailspring-component-kit';
import {MessageImagePopupStore} from 'chat-exports';

var http = require("http");
var https = require("https");
var fs = require("fs");
const path = require('path');
export default class MessageImagePopup extends Component {
  constructor(props) {
    super(props);
    this.state = {
      imgIndex: -1,
      hidden: true
    }
  }
  componentDidMount(){
    this.getAllImages(this.props);
    this.unsubscribers = [];
    this.unsubscribers.push(MessageImagePopupStore.listen(this.onMessageImageChange));
    const footer = document.querySelector('[name=Footer]');
    if (footer) {
      this.footerDisplay = footer.style.display;
    }
  }
  componentWillUnmount() {
    this.unsubscribers.map(unsubscribe => unsubscribe());
  }
  onMessageImageChange = () => {
    const msg = MessageImagePopupStore.msg;
    console.log( 'MessageImagePopup.onMessageImageChange: msg', msg);
    const imgIndex = this.imgMsgs.indexOf(msg);
    this.setState({
      imgIndex,
      hidden:false
    });
    const footer = document.querySelector('[name=Footer]');
    if (footer) {
      footer.style.display = 'none';
    }
  }
  componentDidUpdate() {
    this.node && this.node.focus();
  }
  getContactNameByJid(jid) {
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
  getFileName(msgBody) {
    return msgBody.localFile && path.basename(msgBody.localFile) || msgBody.mediaObjectId.replace(/\.encrypted$/, '');
  }
  downloadImage = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { msgBody } = this.imgMsgs[this.state.imgIndex];
    const fileName = this.getFileName(msgBody);
    const path = dialog.showSaveDialog({
      title: `download file`,
      defaultPath: fileName
    });
    if (!path || typeof path !== 'string') {
      return;
    }
    if (msgBody.path.match(/^file:\/\//)) {
      // console.log('downloadImage: ', msgBody.path);
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
  componentWillReceiveProps = (nexProps) => {
    this.getAllImages(nexProps);
  }
  getAllImages(props) {
    const imgMsgs = [];
    const imgMsgBodies = [];
    const groupedMessages = props.groupedMessages;
    let index = 0;
    for (const groupedMessage of groupedMessages) {
      const { messages } = groupedMessage;
      for (const msg of messages) {
        let msgBody = msg.body
        if(isJsonString(msg.body)) {
          msgBody = JSON.parse(msgBody);
        }
        if (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF || msgBody.type === FILE_TYPE.STICKER) {
          imgMsgs.push(msg);
          imgMsgBodies.push(msgBody);
          index++;
        }
      }
    }
    this.imgMsgs = imgMsgs;
    this.imgMsgBodies = imgMsgBodies;
  }
  gotoPrevImage = (event) => {
    let prevIndex = this.state.imgIndex - 1;
    if (prevIndex < 0) {
      prevIndex = 0
    }
    this.setState({
      imgIndex: prevIndex
    })
  }
  gotoNextImage = (event) => {
    let nextIndex = this.state.imgIndex + 1;
    if (nextIndex > this.imgMsgs.length - 1) {
      nextIndex = this.imgMsgs.length - 1
    }
    this.setState({
      imgIndex: nextIndex
    })
  }
  onKeyUp = (event) => {
    let keyCode = event.keyCode;
    if (keyCode === 37 || keyCode === 38) {
      this.gotoPrevImage();
    } else if (keyCode === 39 || keyCode === 40) {
      this.gotoNextImage();
    } else if (keyCode === 27) { // ESC
      this.hide();
    }
  }
  show = () => {
    document.querySelector('#Center').style.zIndex = 9;
    this.setState({
      hidden: false
    });
  }
  hide = () => {
    document.querySelector('#Center').style.zIndex = 1;
    const footer = document.querySelector('[name=Footer]');
    if (footer) {
      footer.style.display = this.footerDisplay;
    }
    this.setState({
      hidden: true
    });
  }

  render() {
    const {
      referenceTime,
      getContactInfoByJid,
      getContactAvatar
    } = this.props;

    const timeDescriptor = buildTimeDescriptor(referenceTime);
    const { imgIndex } = this.state;
    if (this.state.hidden || imgIndex === -1) {
      return null;
    }
    const msg = this.imgMsgs[imgIndex];
    const msgBody = this.imgMsgBodies[imgIndex];

    const isLeftEdge = imgIndex <= 0;
    const isRightEdge = imgIndex >= this.imgMsgs.length - 1;
    const fileName = this.getFileName(msgBody);
    return (
      <div>
        {imgIndex !== -1 && (
          <div className='message-image-popup' onKeyUp={this.onKeyUp} tabIndex='0' ref={(el) => this.node = el}>
            <div className='message-image-popup-toolbar'>
              <span className='close-button' onClick={this.hide}>
                <RetinaImg name={'close_1.svg'}
                  style={{ width: 24, height: 24 }}
                  isIcon
                  mode={RetinaImg.Mode.ContentIsMask} />
              </span>
              <div className="messageSender image-popup-avatar" className="inline-block">
                {getContactAvatar(getContactInfoByJid(msg.sender))}
              </div>
              <div className="inline-block">
                <div>{fileName}</div>
                <span>{this.getContactNameByJid(msg.sender)} &nbsp; {timeDescriptor(msg.sentTime, true)}</span>
              </div>
              <span className="download-img float-right" onClick={this.downloadImage}>
                <RetinaImg name={'download.svg'}
                  style={{ width: 24, height: 24 }}
                  isIcon
                  mode={RetinaImg.Mode.ContentIsMask} />
              </span>
            </div>
            <div className='message-image-popup-content'>
              <div className="left-span">
                {!isLeftEdge && (
                  <span className='left-arrow-button' onClick={this.gotoPrevImage}>
                    <RetinaImg name={'back.svg'}
                      style={{ width: 60, height: 60 }}
                      isIcon
                      mode={RetinaImg.Mode.ContentIsMask} />
                  </span>
                )}
              </div>
              <div className="img-container">
                <img src={msgBody.path || msgBody.localFile} />
              </div>
              <div className="right-span">
                {!isRightEdge && (
                  <span className='right-arrow-button' onClick={this.gotoNextImage}>
                    <RetinaImg name={'next.svg'}
                      style={{ width: 60, height: 60 }}
                      isIcon
                      mode={RetinaImg.Mode.ContentIsMask} />
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
}

