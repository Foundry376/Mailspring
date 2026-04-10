import { Task } from './task';
import * as Attributes from '../attributes';
import { AttributeValues } from '../models/model';

export class GetManyRFC2822Task extends Task {
  static attributes = {
    ...Task.attributes,

    folderId: Attributes.String({
      modelKey: 'folderId',
    }),
    folderPath: Attributes.String({
      modelKey: 'folderPath',
    }),
    outputDir: Attributes.String({
      modelKey: 'outputDir',
    }),
  };

  folderId: string;
  folderPath: string;
  outputDir: string;

  constructor(data: AttributeValues<typeof GetManyRFC2822Task.attributes> = {}) {
    super(data);
  }

  label() {
    return 'Exporting folder as .eml files';
  }
}
