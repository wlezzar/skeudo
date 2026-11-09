/**
 * TextMate rules for data sketches, which grammars/index.ts puts in `source.skeudo` after a `data` header.
 *
 * They follow the parser (packages/core/src/data/parse.ts) line by line: a group line, a declaration, a
 * step title, a change, or an explanation. One gap: in a fence inside a Markdown list item, every line is
 * indented by the list, so step titles are colored as explanations.
 *
 * Repository names start with `data-`, since every view's rules share one grammar.
 */

import type { Rule } from './shared.ts';

// The parser's patterns, in Oniguruma syntax.
const NAME = String.raw`[\p{L}\p{N}_.\-]+`;
const TABLE = 'entity.name.type.table.skeudo';
const COLUMN = 'variable.other.property.column.skeudo';

export const dataRepository: Record<string, Rule> = {
  // `[label]`, which starts a group.
  'data-group': {
    match: String.raw`^(\[)(.*)(\])\s*$`,
    captures: {
      1: { name: 'punctuation.definition.group.begin.skeudo' },
      2: { name: 'entity.name.namespace.group.skeudo' },
      3: { name: 'punctuation.definition.group.end.skeudo' },
    },
    name: 'meta.group.skeudo',
  },
  // `table name(col, col -> table)` or `folder name(col)`, over one line or several, up to the closing
  // parenthesis or a blank line. The parser reads a declaration without its kind word too, with a warning.
  // A title such as `Login(Google) fails` has a closing parenthesis that doesn't end the line, so it is a step.
  'data-declaration': {
    begin: String.raw`^(?:(table|folder)\s+)?(${NAME})(\()(?=[^)]*$|.*\)\s*$)`,
    beginCaptures: {
      1: { name: 'storage.type.kind.skeudo' },
      2: { name: TABLE },
      3: { name: 'punctuation.definition.columns.begin.skeudo' },
    },
    end: String.raw`\)|^(?=\s*$)`,
    endCaptures: { 0: { name: 'punctuation.definition.columns.end.skeudo' } },
    name: 'meta.declaration.table.skeudo',
    patterns: [
      {
        match: String.raw`(${NAME})\s*(->|→)\s*(${NAME})`,
        captures: { 1: { name: COLUMN }, 2: { name: 'keyword.operator.reference.skeudo' }, 3: { name: TABLE } },
      },
      { match: NAME, name: COLUMN },
      { match: ',', name: 'punctuation.separator.comma.skeudo' },
    ],
  },
  // `+ table id  col: value | col: value`, `~ …` and `- table id`.
  'data-change': {
    begin: String.raw`^\s+(?:(\+)|(~)|(-))\s+(\S+)(?:\s+(\S+))?`,
    beginCaptures: {
      1: { name: 'markup.inserted.skeudo' },
      2: { name: 'markup.changed.skeudo' },
      3: { name: 'markup.deleted.skeudo' },
      4: { name: TABLE },
      5: { name: 'variable.other.constant.id.skeudo' },
    },
    end: '$',
    name: 'meta.change.skeudo',
    patterns: [{ include: '#data-values' }],
  },
  // A column starts the values, right after the id, and each part after a `|`. A value is text up to the next `|`.
  'data-values': {
    patterns: [
      {
        match: String.raw`(?:\G|(?<=\|))\s*(${NAME})\s*(:)`,
        captures: { 1: { name: COLUMN }, 2: { name: 'punctuation.separator.key-value.skeudo' } },
      },
      { match: String.raw`(?<=:)\s*(null)\s*(?=\||$)`, captures: { 1: { name: 'constant.language.null.skeudo' } } },
      { match: '"[^"]*"', name: 'string.quoted.double.skeudo' },
      { match: String.raw`\|`, name: 'punctuation.separator.pipe.skeudo' },
      { match: '[^|"]+', name: 'string.unquoted.value.skeudo' },
    ],
  },
  'data-explanation': {
    match: String.raw`^\s+\S.*$`,
    name: 'comment.block.documentation.explanation.skeudo',
  },
  'data-step': {
    match: String.raw`^\S.*$`,
    name: 'markup.heading.step.skeudo entity.name.section.step.skeudo',
  },
};

/** Everything after the header, line by line. Explanation and step come last, since they take any line. */
export const dataPatterns: Rule[] = [
  { include: '#data-group' },
  { include: '#data-declaration' },
  { include: '#data-change' },
  { include: '#data-explanation' },
  { include: '#data-step' },
];
