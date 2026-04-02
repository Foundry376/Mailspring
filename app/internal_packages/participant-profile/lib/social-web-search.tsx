import React from 'react';
import { localized, Contact, PropTypes } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

/** Best-effort name/phrase for site search (no cloud). */
export function searchQueryFromContact(contact: Contact): string {
  const raw = (contact.name || '').trim();
  if (raw) {
    return raw;
  }
  const email = contact.email || '';
  const local = email.split('@')[0];
  if (!local) {
    return '';
  }
  return local
    .replace(/[.+_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SVG_STYLE: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'block',
  flexShrink: 0,
};

export function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" style={SVG_STYLE} aria-hidden>
      <path
        fill="#E1306C"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
      />
    </svg>
  );
}

export function IconGitHub() {
  return (
    <svg viewBox="0 0 24 24" style={SVG_STYLE} aria-hidden>
      <path
        fill="#24292f"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.1-1.5-1.1-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.67.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.38 9.38 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"
      />
    </svg>
  );
}

export function IconYouTube() {
  return (
    <svg viewBox="0 0 24 24" style={SVG_STYLE} aria-hidden>
      <path
        fill="#f00"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31.5 31.5 0 0 0 .5-5.8 31.5 31.5 0 0 0-.5-5.8z"
      />
      <path fill="#fff" d="M9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
    </svg>
  );
}

function IconTikTok() {
  return (
    <svg viewBox="0 0 24 24" style={SVG_STYLE} aria-hidden>
      <path
        fill="#000000"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"
      />
    </svg>
  );
}

export function buildSocialWebSearchLinks(contact: Contact) {
  const q = searchQueryFromContact(contact);
  if (!q || q.length < 2) {
    return [];
  }
  const enc = encodeURIComponent(q);
  return [
    {
      id: 'linkedin',
      href: `https://www.linkedin.com/search/results/people/?keywords=${enc}`,
      title: localized('Search on LinkedIn'),
      renderIcon: () => (
        <RetinaImg
          url="mailspring://participant-profile/assets/linkedin-sidebar-icon@2x.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      ),
    },
    {
      id: 'facebook',
      href: `https://www.facebook.com/search/people/?q=${enc}`,
      title: localized('Search on Facebook'),
      renderIcon: () => (
        <RetinaImg
          url="mailspring://participant-profile/assets/facebook-sidebar-icon@2x.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      ),
    },
    {
      id: 'instagram',
      href: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q}`)}`,
      title: localized('Search Instagram'),
      renderIcon: () => <IconInstagram />,
    },
    {
      id: 'x',
      href: `https://x.com/search?q=${enc}&f=user`,
      title: localized('Search on X'),
      renderIcon: () => (
        <RetinaImg
          url="mailspring://participant-profile/assets/twitter-sidebar-icon@2x.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      ),
    },
    {
      id: 'github',
      href: `https://github.com/search?q=${enc}&type=users`,
      title: localized('Search on GitHub'),
      renderIcon: () => <IconGitHub />,
    },
    {
      id: 'youtube',
      href: `https://www.youtube.com/results?search_query=${enc}`,
      title: localized('Search on YouTube'),
      renderIcon: () => <IconYouTube />,
    },
    {
      id: 'tiktok',
      href: `https://www.tiktok.com/search?q=${enc}`,
      title: localized('Search on TikTok'),
      renderIcon: () => <IconTikTok />,
    },
  ];
}

export class SocialWebSearchRow extends React.Component<{ contact: Contact }> {
  static displayName = 'SocialWebSearchRow';

  static propTypes = {
    contact: PropTypes.object,
  };

  render() {
    const links = buildSocialWebSearchLinks(this.props.contact);
    if (links.length === 0) {
      return null;
    }

    return (
      <div className="social-web-search">
        <div className="social-web-search-label">{localized('Search the web')}</div>
        <div className="social-web-search-icons">
          {links.map(link => (
            <a
              key={link.id}
              className="social-profile-item social-web-search-link"
              href={link.href}
              title={link.title}
              rel="noopener noreferrer"
            >
              {link.renderIcon()}
            </a>
          ))}
        </div>
      </div>
    );
  }
}
