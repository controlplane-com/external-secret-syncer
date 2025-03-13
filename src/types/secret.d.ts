export interface Tags {
  [x: string]: any;
}

export interface Link {
  rel: string;

  href: string;
}

export type Links = Link[];

export interface Opaque {
  payload?: string;

  encoding?: 'plain' | 'base64';
}
export interface Dict {
  [x: string]: string;
}
export type SecretData = Dict | Opaque;

export interface CplnSecret {
  id: string;
  name: string;
  kind: 'secret';
  version: number;
  description?: string;
  tags?: Tags;
  created: Date;
  lastModified: Date;
  links: Links;
  type: 'dictionary' | 'opaque';
  data: SecretData;
}
