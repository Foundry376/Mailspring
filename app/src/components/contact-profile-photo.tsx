import React from 'react';
import { Contact } from '../flux/models/contact';
import * as Utils from '../flux/models/utils';
import { RetinaImg } from './retina-img';

export class ContactProfilePhoto extends React.Component<{
  contact: Contact;
  loading: boolean;
  avatar: string;
}> {
  render() {
    const { contact, loading, avatar } = this.props;

    const hue = Utils.hueForString(contact.email);
    const bgColor = `hsl(${hue}, 50%, 45%)`;

    let content = (
      <div className="default-profile-image" style={{ backgroundColor: bgColor }}>
        <div className="layer" style={{ zIndex: 1 }}>
          {contact.nameAbbreviation()}
        </div>
      </div>
    );

    if (loading) {
      content = (
        <div className="default-profile-image">
          <RetinaImg
            className="spinner"
            style={{ width: 20, height: 20 }}
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
          />
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
