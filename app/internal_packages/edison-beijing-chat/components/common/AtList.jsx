import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from './ContactAvatar';

export default class AtList extends Component {
  static propTypes = {
    activeIndex: PropTypes.number,
  };
  constructor() {
    super();
    this.state = {};
    this._scrollBox;
  }

  UNSAFE_componentWillReceiveProps({ activeIndex }) {
    this.keepActiveRowInView(activeIndex);
  }

  keepActiveRowInView = activeIndex => {
    if (this._scrollBox) {
      const activeRow = this._scrollBox.querySelectorAll('.contact-row')[activeIndex];
      if (activeRow) {
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  render() {
    const { pos, contacts, activeIndex, chooseAtContact, changeAtActiveIndex } = this.props;

    return (
      <div
        className="at-list-container"
        style={{ bottom: '48px', left: (pos && pos.left ? pos.left + 28 : 28) + 'px' }}
        ref={el => (this._scrollBox = el)}
        onMouseMove={event => {
          // 监听相对于列表外面的盒子的鼠标移动事件，利用事件捕获，将事件转移到列表元素上
          // 不直接监听列表元素是因为列表滚动也会在列表元素身上触发鼠标移动事件
          const target = event.target;
          if (target.className && target.className.indexOf('contact-row') >= 0) {
            const nextActiveIndex = parseInt(target.offsetTop / target.offsetHeight);
            changeAtActiveIndex(nextActiveIndex);
          }
        }}
      >
        {contacts.map((contact, index) => {
          const active = index === activeIndex ? 'active' : '';
          return (
            <div
              className={`contact-row ${active}`}
              key={index}
              onClick={() => chooseAtContact(contact)}
            >
              <ContactAvatar
                jid={contact.jid}
                name={contact.name}
                email={contact.email}
                size={16}
              />
              <span className="contact-name">{contact.name}</span>
              <span className="contact-email">{contact.email}</span>
            </div>
          );
        })}
      </div>
    );
  }
}
