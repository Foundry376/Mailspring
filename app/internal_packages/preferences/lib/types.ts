export interface ConfigLike {
  get: (key: string) => any;
  toggle: (key: string) => void;
  set: (key: string, val: any) => void;
}

export interface ConfigSchemaLike {
  type: string;
  properties: {
    [subkey: string]: ConfigSchemaLike;
  };
  advanced?: string;
  note?: string;
  title?: string;
  enum?: string;
  enumLabels: string;
  platforms?: string[];
  platform?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  unit?: string;
}
