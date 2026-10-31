/** A note attached to a tag: `::write:redis[5 min ttl]`. */
export interface Note {
  /** Note text without the brackets or the leading `!`. */
  text: string;
  /** True when the note starts with `!`. */
  danger: boolean;
}

/** `::kind{modifier}[:value][note]` */
export interface Tag {
  kind: string;
  /** `?` modifier: happens only under a condition the sketch doesn't show. */
  conditional: boolean;
  /** `~` modifier: unverified. */
  unverified: boolean;
  value?: string;
  note?: Note;
  /** Raw source text of the tag. */
  raw: string;
  /** Offsets within the line's text (indentation excluded). */
  start: number;
  end: number;
  /** True when the tag sits at the end of a line after other content (renders in the tag column). */
  trailing: boolean;
}

/** A location written in a `::src` note: `path:start-end`, `path:line`, `path`, or a bare line/range. */
export interface SrcLocation {
  path?: string;
  start?: number;
  end?: number;
}

/** A source location after the signature's file has been applied. */
export interface ResolvedSrc extends SrcLocation {
  /** True when the line has no `::src` of its own and uses its parent block's range. */
  inherited?: boolean;
}

export type Segment =
  | { type: 'text'; text: string }
  /** First word of a prose line or block header. */
  | { type: 'word'; text: string }
  /** Use of a tracked variable (parameter, binding, or labeled name). */
  | { type: 'var'; text: string; name: string; definition: boolean }
  /** A call: `name(…)` or `obj.name(…)`. `head` is set when the chain starts with a tracked variable. */
  | { type: 'call'; text: string; name: string; head?: string }
  /** The function name on the signature line. */
  | { type: 'fn'; text: string }
  | { type: 'tag'; tag: Tag };

export interface SketchLine {
  /** 1-based line number within the sketch source. */
  number: number;
  depth: number;
  /** Line text without indentation or trailing whitespace. */
  text: string;
  blank: boolean;
  signature: boolean;
  /** True when followed by deeper-indented lines. */
  header: boolean;
  /** Line number of the parent block header, if any. */
  parent?: number;
  /** Line numbers of direct children. */
  children: number[];
  /** Name bound on this line (`name = …`). */
  binding?: string;
  tags: Tag[];
  segments: Segment[];
  /** Offset where trailing (tag-column) tags start; equals text.length when there are none. */
  trailingStart: number;
  /** Explicit or inherited source location. */
  src?: ResolvedSrc;
  /** True when the line holds nothing but `::src` tags, so a renderer drops it. */
  hidden: boolean;
}

export interface Variable {
  name: string;
  origin: 'param' | 'binding' | 'label';
  /** Line where it is introduced. */
  line: number;
  /** Label kinds, such as `untrusted` or `secret`. */
  labels: string[];
}

export interface Diagnostic {
  line: number;
  severity: 'warning' | 'error';
  message: string;
}

export interface Signature {
  name: string;
  params: string[];
  line: number;
}

export interface Sketch {
  source: string;
  signature?: Signature;
  /** File named by the `::src` tag on the signature. */
  file?: string;
  /** Spaces per indentation level, when it could be determined. */
  indentUnit?: number;
  lines: SketchLine[];
  variables: Record<string, Variable>;
  /** Call name → definition location, from `::src:name[location]` tags. */
  callSources: Record<string, ResolvedSrc>;
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  /** Tag kinds whose value labels a variable. Defaults to `untrusted` and `secret`. */
  labelKinds?: string[];
}
