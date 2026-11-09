import type { Diagnostic } from '../diagnostic';

/** A column of a table: `name`, or `name -> table` when it holds the ids of that table's rows. */
export interface DataColumn {
  name: string;
  /** The table whose row ids this column holds. */
  ref?: string;
}

/**
 * What kind of store a table is, which says how it is drawn: `table` draws rows and columns, and `folder`
 * draws files, whose row ids are their paths.
 */
export type DataKind = 'table' | 'folder';

/** The words that start a declaration. */
export const DATA_KINDS: readonly DataKind[] = ['table', 'folder'];

/**
 * A table: `table name(col, col -> table)` or `folder name(col)`, with its explanation indented under it.
 * A folder is a table too: the format is the same, only the drawing differs.
 */
export interface DataTable {
  kind: DataKind;
  name: string;
  /** In display order. The row id comes first and isn't one of them. */
  columns: DataColumn[];
  /** Paragraphs of explanation. */
  doc: string[];
  /** Line of the declaration. */
  line: number;
}

/** The values a change sets, by column. `null` is the word null; any other value is text. */
export type DataValues = Record<string, string | null>;

/** `+ table id  col: value | col: value`, `~ table id  col: value` or `- table id`. */
export interface DataChange {
  /** `+` adds a row, `~` changes some of its columns, `-` deletes it. */
  op: '+' | '~' | '-';
  table: string;
  id: string;
  values: DataValues;
  line: number;
}

/**
 * `? table id`, `? table col: value | …` or `? folder prefix/`: a read, which finds rows and changes nothing.
 * One of `id`, `prefix` and `match` is set.
 */
export interface DataRead {
  table: string;
  /** The row's id. */
  id?: string;
  /** The start of the paths of the files it finds, ending with `/`. */
  prefix?: string;
  /** The values every row it finds has, by column. */
  match?: DataValues;
  line: number;
}

/** `> title` under a step: a pause inside it, with its own explanation, changes and reads. */
export interface DataSubstep {
  title: string;
  /** Paragraphs of explanation. */
  doc: string[];
  changes: DataChange[];
  reads: DataRead[];
  line: number;
}

/**
 * A step of the story: a title, an explanation, and the changes and reads it makes. A step with substeps
 * has no changes or reads of its own: they are its substeps'.
 */
export interface DataStep {
  title: string;
  /** Paragraphs of explanation. */
  doc: string[];
  changes: DataChange[];
  reads: DataRead[];
  substeps: DataSubstep[];
  line: number;
}

/**
 * A group: `[label]`, a labeled frame around the tables declared after it, up to the next group line.
 * The label is free words, which the parser doesn't interpret.
 */
export interface DataGroup {
  label: string;
  /** Paragraphs of explanation. */
  doc: string[];
  /** Names of its tables, in the order they are declared. */
  tables: string[];
  line: number;
}

/** A parsed data block: its tables, in the order they are drawn, and the steps of its story. */
export interface DataSketch {
  view: 'data';
  source: string;
  tables: DataTable[];
  /** Tables declared before the first group line are in none. */
  groups: DataGroup[];
  steps: DataStep[];
  diagnostics: Diagnostic[];
}

/** A row as it stands after a step. */
export interface DataRow {
  id: string;
  /** Values by column. Columns never set are missing. */
  values: DataValues;
  /** Whether the step added the row or deleted it. A deleted row is still shown at that step. */
  status?: 'new' | 'removed';
  /** The values the step replaced, by column, for a row the step neither added nor deleted. */
  was: DataValues;
}

/** The rows of each table after a step, by table name. Rows keep the order they were added in. */
export type DataState = Map<string, DataRow[]>;

/** A read played at its line. */
export interface DataFound extends DataRead {
  /** The ids of the rows it finds, in the order the rows were added. */
  found: string[];
}

/** What the board shows at once: a substep, or a whole step that has none. */
export interface DataFrame {
  /** The index of its step. */
  step: number;
  /** The index of its substep in the step, for a step with substeps. */
  substep?: number;
  /** The rows of each table after the frame's changes. */
  state: DataState;
  /** The frame's reads, with the rows each one finds. */
  reads: DataFound[];
}
