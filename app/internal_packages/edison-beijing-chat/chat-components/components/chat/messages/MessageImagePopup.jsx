import React, { Component } from 'react';
import messageModel, { FILE_TYPE } from './messageModel'
import { buildTimeDescriptor } from '../../../utils/time';
import { downloadFile } from '../../../utils/awss3';
import { isJsonString } from '../../../utils/stringUtils';
import CancelIcon from '../../common/icons/CancelIcon';
import Button from '../../common/Button';
const { dialog } = require('electron').remote;

var http = require("http");
var https = require("https");
var fs = require("fs");
const path = require('path');

let key = 0;
export default class MessageImagePopup extends Component {
  constructor() {
    super();
    this.state = {
      imgIndex: -1,
      hidden: true
    }
    messageModel.imagePopup = this;
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
    const { msgBody } = this.images[this.state.imgIndex];
    const fileName = this.getFileName(msgBody);
    const path = dialog.showSaveDialog({
      title: `download file`,
      defaultPath: fileName
    });
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
  componentDidMount = () => {
    this.images = this.getAllImages();
  }
  componentWillReceiveProps = () => {
    this.images = this.getAllImages();
  }
  getAllImages() {
    const imageData = []
    const groupedMessages = this.props.groupedMessages;
    let index = 0;
    for (const groupedMessage of groupedMessages) {
      const { messages } = groupedMessage;
      for (const msg of messages) {
        let msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
        if (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF) {
          if (msg === messageModel.msg) {
            this.setState({
              imgIndex: index
            })
          }
          imageData.push({
            msg,
            msgBody
          })
          index++;
        }
      }
    }
    return imageData;
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
    if (nextIndex > this.images.length - 1) {
      nextIndex = this.images.length - 1
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
    if (this.state.hidden || !messageModel.msg || imgIndex === -1) {
      return null;
    }
    const { msg, msgBody } = this.images[imgIndex];
    const isLeftEdge = imgIndex <= 0;
    const isRightEdge = imgIndex >= this.images.length - 1;
    const fileName = this.getFileName(msgBody);
    return (
      <div>
        {imgIndex !== -1 && (
          <div className='message-image-popup' onKeyUp={this.onKeyUp} tabIndex='0' ref={(el) => this.node = el}>
            <div className='message-image-popup-toolbar'>
              <Button id='close-button' className="no-border" onClick={this.hide}>
                <CancelIcon color={"#787e80"} />
              </Button>
              <div className="messageSender image-popup-avatar" className="inline-block">
                {getContactAvatar(getContactInfoByJid(msg.sender))}
              </div>
              <div className="inline-block">
                <div>{fileName}</div>
                <span>{this.getContactNameByJid(msg.sender)} &nbsp; {timeDescriptor(msg.sentTime, true)}</span>
              </div>
              <span className="download-img float-right" onClick={this.downloadImage}></span>
            </div>
            <div className='message-image-popup-content'>
              <div className="left-span">
                {!isLeftEdge && <span className='left-arrow-button' onClick={this.gotoPrevImage}></span>}
              </div>
              <div className="img-container">
                <img src={msgBody.path || msgBody.localFile} />
              </div>
              <div className="right-span">
                {!isRightEdge && <span className='right-arrow-button' onClick={this.gotoNextImage}></span>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
}

