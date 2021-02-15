/* eslint global-require: 0 */
import path from 'path';
import { Model, AttributeValues } from './model';
import * as Attributes from '../attributes';
import { localized } from '../../intl';
import RegExpUtils from '../../regexp-utils';

/**
Public: File model represents an email attachment.

#// Attributes

`filename`: {AttributeString} The display name of the file. Queryable.

`size`: {AttributeNumber} The size of the file, in bytes.

`contentType`: {AttributeString} The content type of the file (ex: `image/png`)

`contentId`: {AttributeString} If this file is an inline attachment, contentId
is a string that matches a cid:<value> found in the HTML body of a {Message}.

This class also inherits attributes from {Model}

Section: Models
*/
export class File extends Model {
  static attributes = {
    ...Model.attributes,

    filename: Attributes.String({
      modelKey: 'filename',
      queryable: true,
    }),
    size: Attributes.Number({
      modelKey: 'size',
    }),
    contentType: Attributes.String({
      modelKey: 'contentType',
    }),
    messageId: Attributes.String({
      modelKey: 'messageId',
    }),
    contentId: Attributes.String({
      modelKey: 'contentId',
    }),
  };

  public filename: string;
  public size: number;
  public contentType: string;
  public messageId: string;
  public contentId: string;

  constructor(data: AttributeValues<typeof File.attributes>) {
    super(data);
  }

  // Public: Files can have empty names, or no name. `displayName` returns the file's
  // name if one is present, and falls back to appropriate default name based on
  // the contentType. It will always return a non-empty string.
  displayName() {
    // BG: This logic has been moved to the sync side - all files should always have names
    // as of the 1.1 release. This is just here still because people's local dbs could
    // still contain unnammed files.
    const defaultNames = {
      'text/calendar': 'Event.ics',
      'image/png': 'Unnamed Image.png',
      'image/jpg': 'Unnamed Image.jpg',
      'image/jpeg': 'Unnamed Image.jpg',
    };
    if (this.filename && this.filename.length) {
      return this.filename;
    }
    if (defaultNames[this.contentType]) {
      return defaultNames[this.contentType];
    }
    return localized('Unnamed Attachment');
  }

  safeDisplayName() {
    return this.displayName().replace(RegExpUtils.illegalPathCharactersRegexp(), '-');
  }

  // Public: Returns the file extension that should be used for this file.
  // Note that asking for the displayExtension is more accurate than trying to read
  // the extension directly off the filename. The returned extension may be based
  // on contentType and is always lowercase.

  // Returns the extension without the leading '.' (ex: 'png', 'pdf')
  displayExtension() {
    return path.extname(this.displayName().toLowerCase()).substr(1);
  }

  displayFileSize(bytes = this.size) {
    if (bytes === 0) {
      return localized('Empty');
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let threshold = 1000000000;
    let idx = units.length - 1;

    let result = bytes / threshold;
    while (result < 1 && idx >= 0) {
      threshold /= 1000;
      result = bytes / threshold;
      idx--;
    }

    // parseFloat will remove trailing zeros
    const decimalPoints = idx >= 2 ? 1 : 0;
    const rounded = parseFloat(result.toFixed(decimalPoints));
    return `${rounded} ${units[idx]}`;
  }
}
