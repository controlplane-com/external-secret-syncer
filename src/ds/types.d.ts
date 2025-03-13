export interface Term {
  op?: '=' | '>' | '>=' | '<' | '<=' | '!=' | '~' | 'exists' | '!exists';
  property?: string;
  rel?: string;
  tag?: string;
  value?: string | number | boolean | Date;
}
export interface Spec {
  match?: 'all' | 'any' | 'none';
  terms?: Term[];
  sort?: {
    by: string;
    order?: 'asc' | 'desc';
  };
}
export interface Query {
  kind?: Kind;
  context?: {
    [x: string]: any;
  };
  fetch?: 'links' | 'items';
  spec?: Spec;
}
export interface QueryResult<T> {
  kind?: 'queryresult';
  itemKind?: Kind;
  items: T[];
  links: Link[];
  query?: Query;
}
