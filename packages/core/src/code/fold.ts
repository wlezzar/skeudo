/*
 * Folds. A block can fold under its header, and the folded header then shows what the block's lines
 * do, so folding never hides an effect, a failure, a danger, a change or a warning from a reviewer.
 */
import type { Diagnostic } from '../diagnostic.ts';
import { usedVariables } from './analyze.ts';
import { blockLines, CHANGE_KINDS, HIDDEN_KINDS } from './parse.ts';
import type { ChangeKind, CodeSketch, SketchLine, Tag } from './types.ts';

/** Tags of one kind, modifiers and value from the lines of a block, shown as one pill on its folded header. */
export interface RolledTag {
  /** The first of these tags, in line order. */
  tag: Tag;
  /** The line of each of these tags, in order, so a line with two of them is listed twice. */
  lines: number[];
  /** The danger notes of these tags, in order: their `[!…]` notes, or the notes of `::danger` tags. */
  dangers: string[];
  /** True when they are all on removed lines, so they are effects the code no longer has. */
  removed: boolean;
  /**
   * The labeled variables that reach these effects, in order: those used on a line that carries one. Only
   * reads and writes have them, and not removed ones, as in analyze().
   */
  flows: string[];
}

/** What a folded block header shows of the lines under it. */
export interface Rollup {
  /** Line number of the header. */
  header: number;
  /** How many lines fold under the header, leaving out blank lines and lines renderers drop. */
  lines: number;
  /** The tags of the block's lines, in order of first appearance. */
  tags: RolledTag[];
  /** The changes on the block's lines, in order of first appearance. */
  changes: ChangeKind[];
  /** Warnings on the block's lines. */
  diagnostics: Diagnostic[];
}

/**
 * Sums up a block for its header, for when the block is folded. Every tag a reviewer must see rolls up:
 * effects, failures, dangers, doubts, change tags and kinds the spec doesn't define. Labels stay on their
 * variables, but the labeled variables that reach an effect are named on its pill, since the line that
 * shows it is folded away. The tags renderers hide stay hidden. Tags of the same kind, modifiers and value
 * share a pill. Their notes are dropped, except dangers, since a note says how and the pill only says what.
 */
export function rollup(sketch: CodeSketch, header: SketchLine): Rollup {
  const inside = blockLines(sketch.lines, header).filter((l) => !l.blank);
  const numbers = new Set(inside.map((l) => l.number));
  const tags = new Map<string, RolledTag>();
  const changes: ChangeKind[] = [];

  for (const line of inside) {
    if (line.change && !changes.includes(line.change.kind)) changes.push(line.change.kind);
    const labeled = usedVariables(line).filter((name) => sketch.variables[name]?.labels.length);
    for (const tag of line.tags) {
      if (HIDDEN_KINDS.has(tag.kind)) continue;
      if (tag.value && sketch.variables[tag.value]?.labels.includes(tag.kind)) continue;
      // A removed line's effects are ones the code no longer has, so they don't share a pill with current ones.
      const removed = line.change?.kind === 'removed' && !CHANGE_KINDS.has(tag.kind);
      const key = [tag.kind, tag.conditional, tag.unverified, tag.value ?? '', removed].join('\u0000');
      let rolled = tags.get(key);
      if (!rolled) tags.set(key, (rolled = { tag, lines: [], dangers: [], removed, flows: [] }));
      rolled.lines.push(line.number);
      if ((tag.kind === 'read' || tag.kind === 'write') && tag.value && !removed) {
        for (const name of labeled) if (!rolled.flows.includes(name)) rolled.flows.push(name);
      }
      const danger = tag.note && (tag.note.danger || tag.kind === 'danger') ? tag.note.text : undefined;
      if (danger && !rolled.dangers.includes(danger)) rolled.dangers.push(danger);
    }
  }

  return {
    header: header.number,
    lines: inside.filter((l) => !l.hidden).length,
    tags: [...tags.values()],
    changes,
    diagnostics: sketch.diagnostics.filter((d) => numbers.has(d.line)),
  };
}
