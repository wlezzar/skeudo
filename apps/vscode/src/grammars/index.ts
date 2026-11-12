/**
 * TextMate grammars for sketches: `source.skeudo` for .skeudo files, and an injection that embeds it in
 * Markdown's ```skeudo fences, and the ```sketch fences older documents use. The build writes them to dist/ as JSON.
 *
 * Each view's rules are in their own file. Their repository names must not collide, since they share one grammar.
 */

import { codePatterns, codeRepository } from './code.ts';
import { dataPatterns, dataRepository } from './data.ts';
import { LINE_START, NEVER, type Rule } from './shared.ts';

/** `view:` and a name alone on a sketch's first line, which picks the rules for the rest of the sketch. */
const header = (name: string, patterns: Rule[]): Rule => ({
  begin: String.raw`${LINE_START}(view:\s*${name})\s*$`,
  beginCaptures: { 1: { name: 'keyword.control.view.skeudo' } },
  end: NEVER,
  patterns,
});

/**
 * The first line that isn't blank picks the view. Each rule here runs to the end of the sketch, so once
 * one starts the others are no longer tried, and a later line reading `view: data` is just a line of code.
 * Without a header, the sketch is code, and a first line naming no view, such as `view: dat`, is its first line.
 */
const VIEWS: Rule[] = [header('data', dataPatterns), header('code', codePatterns), ...codePatterns];

export const sketchGrammar = {
  name: 'Skeudo',
  scopeName: 'source.skeudo',
  fileTypes: ['skeudo'],
  patterns: VIEWS,
  repository: { ...codeRepository, ...dataRepository },
};

/**
 * Embeds `source.skeudo` in Markdown's ```skeudo and ```sketch fences. It copies the shape of the fence rules in VS Code's
 * Markdown grammar: the `while` rule ends the sketch at the closing fence, even though the sketch's own
 * rules never end. Its fence languages must match FENCE_LANGS in @skeudo/core, which a test checks.
 */
export const markdownInjection = {
  scopeName: 'markdown.skeudo.codeblock',
  // L: puts it ahead of Markdown's own rules. It stays out of code, where a ```skeudo line is just text.
  injectionSelector: 'L:text.html.markdown -markup.fenced_code -markup.raw -meta.embedded',
  patterns: [{ include: '#sketch-fence' }],
  repository: {
    'sketch-fence': {
      begin: String.raw`(^|\G)(\s*)(\`{3,}|~{3,})\s*(skeudo|sketch)(\s+[^\`]*)?$`,
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
          contentName: 'meta.embedded.block.skeudo',
          patterns: [{ include: 'source.skeudo' }],
        },
      ],
    },
  },
};
