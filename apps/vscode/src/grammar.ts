/**
 * TextMate grammars for sketches: `source.sketch` for .sketch files, and an injection that embeds it in
 * Markdown's ```sketch fences. The build writes them to dist/ as JSON.
 *
 * TextMate grammars match one line at a time with regular expressions, so this follows the parser
 * (packages/core/src/parse.ts) as far as that allows, with two gaps:
 * - It can't know which words are tracked variables, so a line starting with one, such as `cached is
 *   stale`, still gets its first word colored.
 * - It can't see the next line, so a first line such as `charge(card, amount)` is taken for a signature
 *   whether or not indented lines follow.
 *
 * Scopes are picked for how common themes color them, starting with VS Code's defaults; README.md lists
 * them for anyone who wants to recolor them.
 */

type Rule = Record<string, unknown>;

// The parser's patterns, in Oniguruma syntax.
const NAME = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*`;
const VALUE = String.raw`${NAME}(?:\.${NAME})*|\*`;
const IDENT = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const CHAIN = String.raw`${IDENT}(?:(?:\.|::)${IDENT})*`;
/** Balanced parentheses on one line. It must be the whole of a group, since it recurses into the group it sits in. */
const PARENS = String.raw`\((?:[^()]|\g<-1>)*\)`;
const WORD = String.raw`[\p{L}][\p{L}\p{N}_'’-]*`;
/**
 * The start of a line, after any indentation. `\G` also matches where an enclosing rule left off: after the
 * indentation of a list item that holds a fence, and where a sketch's first line starts.
 */
const LINE_START = String.raw`(?:^|\G)\s*`;
/** Never matches, for rules that last until the end of the sketch. */
const NEVER = String.raw`(?!)`;

/** Bold, in the color themes give escape sequences: amber in dark themes, red in light ones. */
const DANGER = 'markup.bold.danger.sketch constant.character.escape.danger.sketch';

interface Family {
  /** Tag kinds, or undefined for any kind no other family takes. */
  kinds?: string[];
  /** Scopes of the tag's head, `::kind:value`. `$kind` stands for the kind. */
  head?: string;
  /** Scopes of the whole tag, under its head and note. */
  tag?: string;
  /** How the note reads: free words, a danger, or a source location. */
  note?: 'words' | 'danger' | 'location';
}

const FAMILIES: Record<string, Family> = {
  read: { kinds: ['read'], head: 'support.type.read.sketch' },
  // Orange in VS Code's 2026 themes through `entity.name`, which the older default themes don't color,
  // so they fall back to `string`, which they color orange.
  write: { kinds: ['write'], head: 'string.other.write.sketch entity.name.write.sketch' },
  fail: { kinds: ['fail'], head: 'invalid.fail.sketch' },
  label: { kinds: ['untrusted', 'secret'], head: 'variable.other.constant.$kind.sketch markup.underline.$kind.sketch' },
  danger: { kinds: ['danger'], head: DANGER, note: 'danger' },
  new: { kinds: ['new'], head: 'markup.inserted.new.sketch' },
  changed: { kinds: ['changed'], head: 'markup.changed.sketch' },
  // Themes often color deletions like strings, as they do writes, so it's also struck through.
  removed: { kinds: ['removed'], head: 'markup.deleted.removed.sketch markup.strikethrough.removed.sketch' },
  // Renderers hide ::src tags, so they're muted, with the location underlined like a link.
  src: { kinds: ['src'], tag: 'comment.src.sketch', note: 'location' },
  other: { head: 'entity.name.label.$kind.sketch' },
};

const MODIFIERS: Rule[] = [
  { match: String.raw`\?`, name: 'storage.modifier.conditional.sketch' },
  { match: '~', name: 'storage.modifier.unverified.sketch' },
];

/** A note's rules: `[`, an optional `!`, the text and `]`, whose scopes depend on the tag's family. */
function notePatterns(note: Family['note'] = 'words'): Rule[] {
  const rule = (bang: string, name: string, text?: Rule): Rule => ({
    match: String.raw`(\[)(${bang})([^\]\n]*)(\])`,
    name: ['meta.note.sketch', name].filter(Boolean).join(' '),
    captures: {
      1: { name: 'punctuation.definition.note.begin.sketch' },
      2: { name: 'punctuation.definition.danger.sketch' },
      ...(text && { 3: text }),
      4: { name: 'punctuation.definition.note.end.sketch' },
    },
  });
  if (note === 'danger') return [rule('!?', DANGER)];
  if (note === 'location') return [rule('', '', { name: 'markup.underline.link.sketch' })];
  return [rule('!', DANGER), rule('', 'comment.note.sketch')];
}

/** A tag rule for one family. A tag starts at the beginning of a line or after whitespace. */
function tagRule(family: string, { kinds, head, tag, note }: Family): Rule {
  const kind = kinds ? String.raw`(?:${kinds.join('|')})(?![\p{L}\p{N}_-])` : NAME;
  const headScopes = head?.replaceAll('$kind', '$3') ?? '';
  return {
    match: String.raw`(?<!\S)((::)(${kind})([?~]*+)(?:(:)(${VALUE}))?)(\[[^\]\n]*\])?`,
    name: [`meta.tag.${family}.sketch`, tag].filter(Boolean).join(' '),
    // A capture with its own patterns loses the scopes of the captures around it, so those repeat the head's.
    captures: {
      1: { name: headScopes },
      2: { name: 'punctuation.definition.kind.sketch' },
      4: { name: headScopes, patterns: MODIFIERS },
      5: { name: 'punctuation.separator.value.sketch' },
      6: { name: `${headScopes} meta.value.sketch`.trim(), patterns: [{ match: String.raw`\*`, name: 'constant.language.wildcard.sketch' }] },
      7: { patterns: notePatterns(note) },
    },
  };
}

const ACCESSORS: Rule[] = [{ match: String.raw`\.|::`, name: 'punctuation.accessor.sketch' }];

/** Brackets inside parameters, whose commas don't separate parameters. */
const NESTED: Rule[] = [
  [String.raw`\(`, String.raw`\)`],
  [String.raw`\[`, String.raw`\]`],
  ['{', '}'],
  ['<', '>'],
].map(([begin, end]) => ({
  begin,
  end,
  patterns: [{ include: '#nested' }],
}));

const grammarRepository = {
  line: {
    patterns: [
      ...Object.entries(FAMILIES).map(([family, f]) => tagRule(family, f)),
      // Only a plain name binds, so `order.status = paid` and `a == b` are not bindings.
      {
        match: String.raw`${LINE_START}(${IDENT})\s*(=)(?![=>])`,
        captures: { 1: { name: 'entity.name.variable.sketch' }, 2: { name: 'keyword.operator.assignment.sketch' } },
      },
      // The first word of a line, unless it's code: followed by `(`, `.` or `::`.
      { match: String.raw`${LINE_START}((?>${WORD}))(?!\(|\.|::)`, captures: { 1: { name: 'keyword.control.first-word.sketch' } } },
      // A call closes its parentheses on the same line.
      {
        match: String.raw`(?<![\p{L}\p{N}_])(${CHAIN})(?=(${PARENS}))`,
        name: 'meta.function-call.sketch',
        captures: { 1: { name: 'entity.name.function.sketch', patterns: ACCESSORS } },
      },
    ],
  },
  nested: { patterns: NESTED },
  parameters: {
    patterns: [
      ...NESTED,
      // A parameter is the first name after `(` or a comma, so a type or a default after it is ignored.
      {
        match: String.raw`(?<=[(,])\s*(?:(mut|const|let|var|final|readonly)\s+)?[^\p{L}_,()\[\]{}<>]*(${IDENT})`,
        captures: { 1: { name: 'storage.modifier.sketch' }, 2: { name: 'variable.parameter.sketch' } },
      },
    ],
  },
};

export const sketchGrammar = {
  name: 'Sketch',
  scopeName: 'source.sketch',
  fileTypes: ['sketch'],
  // The first line is either a signature or the start of a signature-less sketch. Both rules run to the
  // end of the sketch, so the signature can only be found on the first line.
  patterns: [
    {
      begin: String.raw`${LINE_START}(${CHAIN})(\()((?:[^()]|(${PARENS}))*)(\))(?=\s*(?::|$))`,
      // Each capture names the signature, since one with its own patterns loses the scopes of those around it.
      beginCaptures: {
        1: { name: 'meta.function.signature.sketch entity.name.function.sketch', patterns: ACCESSORS },
        2: { name: 'meta.function.signature.sketch punctuation.definition.parameters.begin.sketch' },
        3: { name: 'meta.function.signature.sketch meta.parameters.sketch', patterns: [{ include: '#parameters' }] },
        5: { name: 'meta.function.signature.sketch punctuation.definition.parameters.end.sketch' },
      },
      end: NEVER,
      patterns: [{ include: '#line' }],
    },
    { begin: String.raw`(?=\S)`, end: NEVER, patterns: [{ include: '#line' }] },
  ],
  repository: grammarRepository,
};

/**
 * Embeds `source.sketch` in Markdown's ```sketch fences. It copies the shape of the fence rules in VS Code's
 * Markdown grammar: the `while` rule ends the sketch at the closing fence, even though the sketch's own
 * rules never end.
 */
export const markdownInjection = {
  scopeName: 'markdown.sketch.codeblock',
  // L: puts it ahead of Markdown's own rules. It stays out of code, where a ```sketch line is just text.
  injectionSelector: 'L:text.html.markdown -markup.fenced_code -markup.raw -meta.embedded',
  patterns: [{ include: '#sketch-fence' }],
  repository: {
    'sketch-fence': {
      begin: String.raw`(^|\G)(\s*)(\`{3,}|~{3,})\s*(sketch)(\s+[^\`]*)?$`,
      beginCaptures: {
        3: { name: 'punctuation.definition.markdown' },
        4: { name: 'fenced_code.block.language.markdown' },
        5: { name: 'fenced_code.block.language.attributes.markdown' },
      },
      end: String.raw`(^|\G)(\2|\s{0,3})(\3)\s*$`,
      endCaptures: { 3: { name: 'punctuation.definition.markdown' } },
      name: 'markup.fenced_code.block.markdown',
      patterns: [
        {
          begin: String.raw`(^|\G)(\s*)(.*)`,
          while: String.raw`(^|\G)(?!\s*([\`~]{3,})\s*$)`,
          contentName: 'meta.embedded.block.sketch',
          patterns: [{ include: 'source.sketch' }],
        },
      ],
    },
  },
};
