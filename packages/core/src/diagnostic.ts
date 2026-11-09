/** A problem with one line of a block. A block always renders, so problems never stop the rendering. */
export interface Diagnostic {
  /** 1-based line number within the block. */
  line: number;
  severity: 'warning' | 'error';
  message: string;
}
