import React from 'react';
import { Contact } from '../flux/models/contact';
import * as Utils from '../flux/models/utils';
import { LoadingSpinner } from './loading-spinner';
import crypto from 'crypto';

export class ContactProfilePhoto extends React.Component<{
  contact: Contact;
  loading: boolean;
  avatar: string;
}> {
  render() {
    const { contact, loading, avatar } = this.props;

    const hue = Utils.hueForString(contact.email);
    const bgColor = `hsl(${hue}, 50%, 45%)`;

    const hash = crypto
      .createHash('sha256')
      .update((contact.email || '').toLowerCase().trim())
      .digest('hex');
    const gravatarBg = `url("https://www.gravatar.com/avatar/${hash}/?s=88&msw=88&msh=88&d=blank")`;

    let content = (
      <div className="default-profile-image" style={{ backgroundColor: bgColor }}>
        <div className="layer" style={{ zIndex: 2, backgroundImage: gravatarBg }} />
        <div className="layer" style={{ zIndex: 1 }}>
          {contact.nameAbbreviation()}
        </div>
      </div>
    );

    if (loading) {
      content = (
        <div className="default-profile-image">
          <LoadingSpinner size={20} />
        </div>
      );
    }

    if (avatar) {
      content = <img alt="Profile" src={avatar} />;
    }

    return (
      <div className="contact-profile-photo">
        <div className="profile-photo">{content}</div>
      </div>
    );
  }
}
