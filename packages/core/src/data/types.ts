import type { Diagnostic } from '../diagnostic';

/** A column of a table: `name`, or `name -> table` when it holds the ids of that table's rows. */
export interface DataColumn {
  name: string;
  /** The table whose row ids this column holds. */
  ref?: string;
}

/** A table: `name(col, col -> table)`, with its explanation indented under it. */
export interface DataTable {
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

/** A step of the story: a title, an explanation, and the changes it makes. */
export interface DataStep {
  title: string;
  /** Paragraphs of explanation. */
  doc: string[];
  changes: DataChange[];
  line: number;
}

/** A parsed data block: its tables, in the order they are drawn, and the steps of its story. */
export interface DataSketch {
  view: 'data';
  source: string;
  tables: DataTable[];
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
