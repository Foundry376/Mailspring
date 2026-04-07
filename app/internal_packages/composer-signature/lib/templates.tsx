import React from 'react';
import querystring from 'querystring';

/** Text badge instead of remote GIFs — keeps signatures free of http(s) image URLs. */
function SocialBadge({ letter, color }: { letter: string; color?: string }) {
  const c = color || '#666';
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 13,
        height: 13,
        lineHeight: '13px',
        fontSize: 9,
        fontWeight: 700,
        textAlign: 'center',
        color: c,
        border: `1px solid ${c}`,
        borderRadius: 2,
        verticalAlign: 'middle',
      }}
    >
      {letter}
    </span>
  );
}

function widthAndHeightForPhotoURL(
  photoURL,
  {
    maxWidth,
    maxHeight,
    photoMsw,
    photoMsh,
  }: {
    maxWidth?: number;
    maxHeight?: number;
    photoMsw?: string | number;
    photoMsh?: string | number;
  } = {}
) {
  if (!photoURL) {
    return {};
  }
  let msw: number;
  let msh: number;
  const ew = photoMsw != null && photoMsw !== '' ? parseInt(String(photoMsw), 10) : NaN;
  const eh = photoMsh != null && photoMsh !== '' ? parseInt(String(photoMsh), 10) : NaN;
  if (!Number.isNaN(ew) && !Number.isNaN(eh) && ew > 0 && eh > 0) {
    msw = ew;
    msh = eh;
  } else {
    let q: any = {};
    try {
      const qPart = photoURL.includes('?') ? photoURL.split('?').pop() : '';
      q = querystring.parse(qPart);
    } catch (err) {
      return {};
    }
    if (!q.msw || !q.msh) {
      return {};
    }
    msw = parseInt(String(q.msw), 10);
    msh = parseInt(String(q.msh), 10);
  }
  if (!msw || !msh || msw <= 0 || msh <= 0) {
    return {};
  }
  const mw = maxWidth != null ? maxWidth : msw;
  const mh = maxHeight != null ? maxHeight : msh;
  const scale = Math.min(1, mw / msw, mh / msh);
  return {
    width: Math.round(msw * scale),
    height: Math.round(msh * scale),
  };
}
// Generic components used across templates

const PrefixStyles = {
  None: {},
  Letter: {
    email: 'E: ',
    phone: 'P: ',
    websiteURL: 'W: ',
    address: 'A: ',
  },
  LetterWithSlash: {
    email: 'E // ',
    phone: 'P // ',
    websiteURL: 'W // ',
    address: 'A // ',
  },
  Full: {
    email: 'Email: ',
    phone: 'Phone: ',
    websiteURL: 'Web: ',
    address: 'Address: ',
  },
};

function GenericInfoBlock(props, prefixStyle: any = PrefixStyles.None) {
  return (
    <div>
      {props.email && (
        <div>
          {prefixStyle.email && <span>{prefixStyle.email}</span>}
          <a style={{ color: props.tintColor }} href={`mailto:${props.email}`}>
            {props.email}
          </a>
        </div>
      )}
      <div>
        {props.phone && (
          <span style={{ marginRight: 8 }}>
            {prefixStyle.phone && <span>{prefixStyle.phone}</span>}
            <a style={{ color: props.tintColor }} href={`tel:${props.phone}`}>
              {props.phone}
            </a>
          </span>
        )}
        {props.fax && (
          <span>
            <a style={{ color: props.tintColor }} href={`tel:${props.fax}`}>
              {props.fax}
            </a>
            &nbsp;(Fax)
          </span>
        )}
      </div>
      {props.address && (
        <div>
          {prefixStyle.address && <span>{prefixStyle.address}</span>}
          <a
            style={{ color: props.tintColor }}
            href={`https://maps.google.com/?q=${encodeURIComponent(props.address)}`}
          >
            {props.address}
          </a>
        </div>
      )}
      {props.websiteURL && (
        <div>
          {prefixStyle.websiteURL && <span>{prefixStyle.websiteURL}</span>}
          <a style={{ color: props.tintColor }} href={`${props.websiteURL}`}>
            {props.websiteURL}
          </a>
        </div>
      )}
      <div>
        {props.facebookURL && (
          <a
            href={props.facebookURL}
            title="Facebook"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="f" color={props.tintColor} />
          </a>
        )}
        {props.linkedinURL && (
          <a
            href={props.linkedinURL}
            title="LinkedIn"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="L" color={props.tintColor} />
          </a>
        )}
        {props.mediumURL && (
          <a
            href={props.mediumURL}
            title="Medium"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="M" color={props.tintColor} />
          </a>
        )}
        {props.githubURL && (
          <a
            href={props.githubURL}
            title="GitHub"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="G" color={props.tintColor} />
          </a>
        )}
        {props.youtubeURL && (
          <a
            href={props.youtubeURL}
            title="YouTube"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="Y" color={props.tintColor} />
          </a>
        )}
        {props.twitterHandle && (
          <a
            href={`https://twitter.com/${props.twitterHandle}`}
            title="Twitter"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="X" color={props.tintColor} />
          </a>
        )}
        {props.instagramURL && (
          <a
            href={props.instagramURL}
            title="Instagram"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            <SocialBadge letter="I" color={props.tintColor} />
          </a>
        )}
      </div>
    </div>
  );
}

/* Important! We use function.name to store the selected template index!
Do not rename these methods after shipping a release with them */

const Templates = [
  function SignatureA(props) {
    return (
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              {props.photoURL && (
                <img
                  alt=""
                  key={props.photoURL}
                  src={props.photoURL}
                  {...widthAndHeightForPhotoURL(props.photoURL, {
                    maxWidth: 60,
                    maxHeight: 60,
                    photoMsw: props.photoMsw,
                    photoMsh: props.photoMsh,
                  })}
                  style={{ maxWidth: 60, maxHeight: 60, marginRight: 10 }}
                />
              )}
            </td>
            <td>
              {props.name && <div>{props.name}</div>}
              {props.title && <div>{props.title}</div>}
              <div
                style={{
                  fontSize: '0.9em',
                  borderTop: `1px solid ${props.tintColor || 'gray'}`,
                  minWidth: 250,
                  maxWidth: 300,
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                {GenericInfoBlock(props)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  },

  function SignatureB(props) {
    return (
      <div>
        <table cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td colSpan={2}>
                <div style={{ paddingBottom: 15 }}>
                  {props.name && (
                    <div>
                      <strong>{props.name}</strong>
                    </div>
                  )}
                  {props.title && <div>{props.title}</div>}
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ verticalAlign: 'top' }}>
                {props.photoURL && (
                  <img
                    alt=""
                    key={props.photoURL}
                    src={props.photoURL}
                    {...widthAndHeightForPhotoURL(props.photoURL, {
                      maxWidth: 200,
                      maxHeight: 60,
                      photoMsw: props.photoMsw,
                      photoMsh: props.photoMsh,
                    })}
                    style={{ maxWidth: 200, maxHeight: 60 }}
                  />
                )}
              </td>
              <td>
                <div
                  style={{
                    fontSize: '0.9em',
                    whiteSpace: 'nowrap',
                    borderLeft: `2px solid ${props.tintColor || 'gray'}`,
                    marginLeft: 20,
                    paddingLeft: 20,
                  }}
                >
                  {GenericInfoBlock(props, PrefixStyles.Letter)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  },

  function SignatureC(props) {
    return (
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              {props.photoURL && (
                <img
                  alt=""
                  key={props.photoURL}
                  src={props.photoURL}
                  {...widthAndHeightForPhotoURL(props.photoURL, {
                    maxWidth: 200,
                    maxHeight: 130,
                    photoMsw: props.photoMsw,
                    photoMsh: props.photoMsh,
                  })}
                  style={{ maxWidth: 200, maxHeight: 130, marginRight: 20 }}
                />
              )}
            </td>
            <td>
              {props.name && (
                <div>
                  <strong>{props.name}</strong>
                  {props.title && (
                    <span style={{ color: props.tintColor || 'gray', paddingLeft: 15 }}>
                      {props.title}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  fontSize: '0.9em',
                  minWidth: 200,
                  maxWidth: 400,
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                {GenericInfoBlock(props)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  },

  function SignatureD(props) {
    return (
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td>
              {props.name && (
                <div>
                  <strong>{props.name}</strong>
                </div>
              )}
              {props.title && (
                <div
                  style={{
                    borderTop: `2px solid ${props.tintColor || 'gray'}`,
                    paddingTop: 3,
                    marginTop: 3,
                  }}
                >
                  {props.title}
                </div>
              )}

              {props.photoURL && (
                <img
                  alt=""
                  key={props.photoURL}
                  src={props.photoURL}
                  {...widthAndHeightForPhotoURL(props.photoURL, {
                    maxWidth: 200,
                    maxHeight: 130,
                    photoMsw: props.photoMsw,
                    photoMsh: props.photoMsh,
                  })}
                  style={{ maxWidth: 200, maxHeight: 130, marginTop: 12, marginBottom: 12 }}
                />
              )}

              <div
                style={{
                  fontSize: '0.9em',
                  minWidth: 250,
                  maxWidth: 300,
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                {GenericInfoBlock(props, PrefixStyles.LetterWithSlash)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  },

  function SignatureE(props) {
    return (
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', width: 1 }}>
              {props.photoURL && (
                <img
                  alt=""
                  key={props.photoURL}
                  src={props.photoURL}
                  {...widthAndHeightForPhotoURL(props.photoURL, {
                    maxWidth: 60,
                    maxHeight: 60,
                    photoMsw: props.photoMsw,
                    photoMsh: props.photoMsh,
                  })}
                  style={{ maxWidth: 60, maxHeight: 60, marginRight: 10 }}
                />
              )}
            </td>
            <td>
              {props.name && (
                <div>
                  <strong>{props.name}</strong>
                </div>
              )}
              {props.title && <div>{props.title}</div>}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <div
                style={{
                  fontSize: '0.9em',
                  borderTop: `1px dashed ${props.tintColor || 'gray'}`,
                  minWidth: 250,
                  maxWidth: 400,
                  marginTop: 10,
                  paddingTop: 4,
                }}
              >
                <div>
                  {props.email && (
                    <a
                      style={{ color: props.tintColor, marginRight: 8 }}
                      href={`mailto:${props.email}`}
                    >
                      {props.email}
                    </a>
                  )}
                  {props.phone && (
                    <a
                      style={{ color: props.tintColor, marginRight: 8 }}
                      href={`tel:${props.phone}`}
                    >
                      {props.phone}
                    </a>
                  )}
                  {props.fax && (
                    <span style={{ marginRight: 8 }}>
                      <a style={{ color: props.tintColor }} href={`tel:${props.fax}`}>
                        {props.fax}
                      </a>
                      &nbsp;(Fax)
                    </span>
                  )}
                  {props.facebookURL && (
                    <a
                      href={props.facebookURL}
                      title="Facebook"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="f" color={props.tintColor} />
                    </a>
                  )}
                  {props.mediumURL && (
                    <a
                      href={props.mediumURL}
                      title="Medium"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="M" color={props.tintColor} />
                    </a>
                  )}
                  {props.githubURL && (
                    <a
                      href={props.githubURL}
                      title="Github"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="G" color={props.tintColor} />
                    </a>
                  )}
                  {props.youtubeURL && (
                    <a
                      href={props.youtubeURL}
                      title="YouTube"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="Y" color={props.tintColor} />
                    </a>
                  )}
                  {props.linkedinURL && (
                    <a
                      href={props.linkedinURL}
                      title="LinkedIn"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="L" color={props.tintColor} />
                    </a>
                  )}
                  {props.twitterHandle && (
                    <a
                      href={`https://twitter.com/${props.twitterHandle}`}
                      title="Twitter"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      <SocialBadge letter="X" color={props.tintColor} />
                    </a>
                  )}
                </div>
                <div>
                  {props.websiteURL && (
                    <a
                      style={{ color: props.tintColor, marginRight: 8 }}
                      href={`${props.websiteURL}`}
                    >
                      {props.websiteURL}
                    </a>
                  )}
                </div>
                <div>
                  {props.address && (
                    <a
                      style={{ color: props.tintColor }}
                      href={`https://maps.google.com/?q=${encodeURIComponent(props.address)}`}
                    >
                      {props.address}
                    </a>
                  )}
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  },
];

export default Templates;
