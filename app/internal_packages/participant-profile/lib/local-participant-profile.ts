import crypto from 'crypto';
import { Contact, Utils } from 'mailspring-exports';
import { parse } from '../../contacts/lib/ContactInfoMapping';

function gravatarUrlForEmail(email: string) {
  const hash = crypto
    .createHash('md5')
    .update(email.trim().toLowerCase())
    .digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=mp&s=160`;
}

/**
 * Build sidebar profile data from the local {@link Contact} only (address book +
 * message headers). No identity server.
 */
export function buildLocalParticipantProfile(contact: Contact) {
  const email = contact.email;
  if (!email || Utils.likelyNonHumanEmail(email)) {
    return {};
  }

  const avatar = gravatarUrlForEmail(email);
  const person: {
    facebook?: { handle: string };
    twitter?: { handle: string };
    linkedin?: { handle: string };
    instagram?: { handle: string };
    github?: { handle: string };
    youtube?: { handle: string };
    employment?: { title: string; name: string };
    location?: string;
    bio?: string;
  } = {};

  try {
    const { data } = parse(contact);
    if (data.notes) {
      person.bio = data.notes;
    }
    if (data.addresses && data.addresses.length > 0) {
      const a = data.addresses[0];
      person.location =
        a.formattedValue ||
        [a.streetAddress, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(', ');
    }
    const title = (data.title || '').trim();
    const companyName = (data.company || '').trim();
    if (title || companyName) {
      person.employment = { title, name: companyName };
    }
    if (data.urls && data.urls.length > 0) {
      for (const u of data.urls) {
        const raw = (u.value || '').trim();
        if (!raw) continue;
        const lower = raw.toLowerCase();
        if (lower.includes('linkedin.com')) {
          const m = raw.match(/linkedin\.com\/(in\/[^/?#]+|company\/[^/?#]+)/i);
          if (m) {
            person.linkedin = { handle: m[1] };
          }
        } else if (lower.includes('twitter.com/') || lower.includes('x.com/')) {
          const m = raw.match(/(?:twitter|x)\.com\/@?([^/?#]+)/i);
          if (m) {
            person.twitter = { handle: m[1] };
          }
        } else if (lower.includes('facebook.com/')) {
          const m = raw.match(/facebook\.com\/([^/?#]+)/i);
          if (m) {
            person.facebook = { handle: m[1] };
          }
        } else if (lower.includes('instagram.com/')) {
          const m = raw.match(/instagram\.com\/([^/?#]+)/i);
          if (
            m &&
            !['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'].includes(
              m[1].toLowerCase()
            )
          ) {
            person.instagram = { handle: m[1].replace(/^@/, '') };
          }
        } else if (lower.includes('github.com/')) {
          const m = raw.match(/github\.com\/([^/?#]+)/i);
          if (
            m &&
            !['settings', 'login', 'signup', 'topics', 'explore', 'marketplace'].includes(
              m[1].toLowerCase()
            )
          ) {
            person.github = { handle: m[1] };
          }
        } else if (lower.includes('youtube.com/') || lower.includes('youtu.be/')) {
          const ym =
            raw.match(/youtube\.com\/@([^/?#]+)/i) ||
            raw.match(/youtube\.com\/(?:c|user|channel)\/([^/?#]+)/i);
          if (ym) {
            person.youtube = { handle: ym[1] };
          }
        }
      }
    }
  } catch (_err) {
    // ignore parse errors; we still show Gravatar + company guess
  }

  const domain = email.split('@')[1] || '';
  const guessedCompany = contact.guessCompanyFromEmail();
  const company = guessedCompany
    ? {
        name: guessedCompany,
        domain: domain && !domain.startsWith('[') ? domain : '',
      }
    : undefined;

  const hasPerson =
    person.bio ||
    person.location ||
    person.employment ||
    person.linkedin ||
    person.twitter ||
    person.facebook ||
    person.instagram ||
    person.github ||
    person.youtube;

  return {
    avatar,
    ...(hasPerson ? { person } : {}),
    ...(company && company.name ? { company } : {}),
  };
}
