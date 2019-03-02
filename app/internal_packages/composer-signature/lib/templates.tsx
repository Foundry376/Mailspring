import React from 'react';
import querystring from 'querystring';

// Static components

const FB_SHARE = (
  <img
    src="https://www.getmailspring.com/signature-assets/fb.gif"
    width="13"
    height="13"
    alt="Facebook"
  />
);
const TWITTER_SHARE = (
  <img
    src="https://www.getmailspring.com/signature-assets/twitter.gif"
    width="13"
    height="13"
    alt="Twitter"
  />
);
const LINKEDIN_SHARE = (
  <img
    src="https://www.getmailspring.com/signature-assets/linkedin.gif"
    width="13"
    height="13"
    alt="LinkedIn"
  />
);

function widthAndHeightForPhotoURL(
  photoURL,
  { maxWidth, maxHeight }: { maxWidth?: number; maxHeight?: number } = {}
) {
  if (!photoURL) {
    return {};
  }
  let q: any = {};
  try {
    q = querystring.parse(photoURL.split('?').pop());
  } catch (err) {
    return {};
  }
  if (!q.msw || !q.msh) {
    return {};
  }
  const scale = Math.min(1, maxWidth / q.msw, maxHeight / q.msh);
  return {
    width: Math.round(q.msw * scale),
    height: Math.round(q.msh * scale),
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
            </a>&nbsp;(Fax)
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
            {FB_SHARE}
          </a>
        )}
        {props.linkedinURL && (
          <a
            href={props.linkedinURL}
            title="LinkedIn"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            {LINKEDIN_SHARE}
          </a>
        )}
        {props.twitterHandle && (
          <a
            href={`https://twitter.com/${props.twitterHandle}`}
            title="Twitter"
            style={{ marginRight: 8, color: props.tintColor }}
          >
            {TWITTER_SHARE}
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
                  {...widthAndHeightForPhotoURL(props.photoURL, { maxWidth: 60, maxHeight: 60 })}
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
                    {...widthAndHeightForPhotoURL(props.photoURL, { maxWidth: 200, maxHeight: 60 })}
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
                  {...widthAndHeightForPhotoURL(props.photoURL, { maxWidth: 200, maxHeight: 130 })}
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
                  {...widthAndHeightForPhotoURL(props.photoURL, { maxWidth: 200, maxHeight: 130 })}
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
                  {...widthAndHeightForPhotoURL(props.photoURL, { maxWidth: 60, maxHeight: 60 })}
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
                      </a>&nbsp;(Fax)
                    </span>
                  )}
                  {props.facebookURL && (
                    <a
                      href={props.facebookURL}
                      title="Facebook"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      {FB_SHARE}
                    </a>
                  )}
                  {props.linkedinURL && (
                    <a
                      href={props.linkedinURL}
                      title="LinkedIn"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      {LINKEDIN_SHARE}
                    </a>
                  )}
                  {props.twitterHandle && (
                    <a
                      href={`https://twitter.com/${props.twitterHandle}`}
                      title="Twitter"
                      style={{ marginRight: 8, color: props.tintColor }}
                    >
                      {TWITTER_SHARE}
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
