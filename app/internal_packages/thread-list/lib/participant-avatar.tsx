import React from 'react';
import { Contact } from 'mailspring-exports';

interface ParticipantAvatarProps {
  contact: Contact;
  size?: number;
  className?: string;
}

class ParticipantAvatar extends React.Component<ParticipantAvatarProps> {
  static displayName = 'ParticipantAvatar';

  static defaultProps = {
    size: 32,
  };

  getInitials = (contact: Contact): string => {
    if (!contact.name) {
      // If no name, use first part of email
      const emailPart = contact.email.split('@')[0];
      return emailPart.slice(0, 2).toUpperCase();
    }

    const nameParts = contact.name.trim().split(/\s+/);
    
    if (nameParts.length === 1) {
      // Single name, use first two letters
      return nameParts[0].slice(0, 2).toUpperCase();
    } else {
      // Multiple names, use first letter of first two names
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
  };

  getAvatarColor = (contact: Contact): string => {
    // Generate a consistent color based on the contact's email or name
    const seed = contact.email || contact.name || 'default';
    let hash = 0;
    
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Vibrant color palette
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Light Yellow
      '#BB8FCE', // Purple
      '#85C1E2', // Light Blue
      '#F8B739', // Orange
      '#52B788', // Forest Green
      '#F72585', // Pink
      '#7209B7', // Violet
      '#3A0CA3', // Indigo
      '#4361EE', // Electric Blue
    ];
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  render() {
    const { contact, size, className } = this.props;
    const initials = this.getInitials(contact);
    const backgroundColor = this.getAvatarColor(contact);
    
    const avatarStyle: React.CSSProperties = {
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor,
      color: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${size * 0.4}px`,
      fontWeight: '600',
      flexShrink: 0,
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      transition: 'all 0.2s ease',
    };

    return (
      <div 
        className={`participant-avatar ${className || ''}`}
        style={avatarStyle}
        title={contact.displayName({ includeAccountLabel: false })}
      >
        {initials}
      </div>
    );
  }
}

export default ParticipantAvatar;
