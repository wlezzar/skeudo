import { CHANGE_KINDS } from './parse.ts';
import type { Diagnostic } from '../diagnostic.ts';
import type { ChangeKind, CodeSketch, Note, SketchLine, Tag, Variable } from './types.ts';

export interface Effect {
  line: number;
  direction: 'read' | 'write';
  /** Full system value, such as `postgres.orders` or `*`. */
  system: string;
  /** System without its part: `postgres`. */
  root: string;
  /** Part after the first dot: `orders`. */
  part?: string;
  conditional: boolean;
  unverified: boolean;
  /** The system is `*`: decided at runtime. */
  runtime: boolean;
  note?: Note;
  tag: Tag;
  /** The line's text with its tags removed. */
  context: string;
  /** What the change being sketched did to the effect's line. A removed effect is one the code no longer has. */
  change?: ChangeKind;
}

/** A change tag, with the effects on the lines it covers. */
export interface Change {
  line: number;
  kind: ChangeKind;
  note?: string;
  tag: Tag;
  context: string;
  /** True when the tag is `::new` or `::removed` on a block header, so it covers the whole block. */
  block: boolean;
  /** Effects on the lines the change covers, in order. */
  effects: Effect[];
}

/** Systems, counted from the effects the code has: removed effects are left out. */
export interface SystemUse {
  name: string;
  reads: number;
  writes: number;
  parts: string[];
  runtime: boolean;
}

export interface Failure {
  line: number;
  name: string;
  /** Prose on the line, or the enclosing block header when the line has none. */
  condition: string;
  tag: Tag;
}

export interface Flag {
  line: number;
  kind: 'danger' | 'unsure' | 'unverified' | 'runtime';
  text: string;
  tag: Tag;
}

/** A labeled variable used on a line that has an effect. Removed effects are left out. */
export interface Flow {
  line: number;
  variable: string;
  labels: string[];
  effect: Effect;
}

export interface Review {
  effects: Effect[];
  systems: SystemUse[];
  failures: Failure[];
  flags: Flag[];
  flows: Flow[];
  /** Change tags in a sketch of a commit or pull request, in line order. */
  changes: Change[];
  labeled: Variable[];
  /** Tags of kinds the spec doesn't define, such as `::todo` or `::lock`. */
  others: { line: number; tag: Tag; context: string }[];
  diagnostics: Diagnostic[];
}

const KNOWN = new Set(['read', 'write', 'fail', 'src', 'repo', 'doc', 'danger', 'unsure', 'untrusted', 'secret', ...CHANGE_KINDS]);

/** The line's text without its tags. */
export function lineContext(line: SketchLine): string {
  let text = line.text;
  for (const t of [...line.tags].reverse()) text = text.slice(0, t.start) + text.slice(t.end);
  return text.replace(/\s+/g, ' ').trim();
}

export function analyze(sketch: CodeSketch): Review {
  const byNumber = new Map(sketch.lines.map((l) => [l.number, l]));
  const effects: Effect[] = [];
  const failures: Failure[] = [];
  const flags: Flag[] = [];
  const flows: Flow[] = [];
  const others: Review['others'] = [];
  const systems = new Map<string, SystemUse>();
  const changes: Change[] = [];
  const changeAt = new Map<number, Change>();

  for (const line of sketch.lines) {
    if (line.blank) continue;
    const context = lineContext(line);
    const lineEffects: Effect[] = [];

    const own = line.change && line.change.from === undefined ? line.tags.find((t) => CHANGE_KINDS.has(t.kind)) : undefined;
    if (own && line.change) {
      const change: Change = {
        line: line.number,
        kind: line.change.kind,
        note: line.change.note,
        tag: own,
        context,
        block: line.header && line.change.kind !== 'changed',
        effects: [],
      };
      changes.push(change);
      changeAt.set(line.number, change);
    }
    const coveringChange = line.change && changeAt.get(line.change.from ?? line.number);

    for (const tag of line.tags) {
      if (tag.note?.danger) flags.push({ line: line.number, kind: 'danger', text: tag.note.text, tag });

      if ((tag.kind === 'read' || tag.kind === 'write') && tag.value) {
        const system = tag.value;
        const dot = system.indexOf('.');
        const root = dot === -1 ? system : system.slice(0, dot);
        const effect: Effect = {
          line: line.number,
          direction: tag.kind,
          system,
          root,
          part: dot === -1 ? undefined : system.slice(dot + 1),
          conditional: tag.conditional,
          unverified: tag.unverified,
          runtime: system === '*',
          note: tag.note,
          tag,
          context,
          change: line.change?.kind,
        };
        effects.push(effect);
        coveringChange?.effects.push(effect);

        // A removed effect is one the code no longer has: it isn't counted or followed.
        if (effect.change !== 'removed') {
          lineEffects.push(effect);
          const use = systems.get(root) ?? { name: root, reads: 0, writes: 0, parts: [], runtime: effect.runtime };
          if (tag.kind === 'read') use.reads++;
          else use.writes++;
          if (effect.part && !use.parts.includes(effect.part)) use.parts.push(effect.part);
          systems.set(root, use);
        }

        if (effect.unverified) flags.push({ line: line.number, kind: 'unverified', text: `${tag.kind}:${system} is unverified`, tag });
        if (effect.runtime) flags.push({ line: line.number, kind: 'runtime', text: `${tag.kind} target is decided at runtime`, tag });
      } else if (tag.kind === 'fail' && tag.value) {
        let condition = context;
        if (!condition && line.parent !== undefined) {
          const parent = byNumber.get(line.parent);
          if (parent) condition = lineContext(parent).replace(/:$/, '');
        }
        failures.push({ line: line.number, name: tag.value, condition, tag });
      } else if (tag.kind === 'danger') {
        if (!tag.note?.danger) flags.push({ line: line.number, kind: 'danger', text: tag.note?.text || context, tag });
      } else if (tag.kind === 'unsure') {
        flags.push({ line: line.number, kind: 'unsure', text: tag.note?.text || context, tag });
      } else if (!KNOWN.has(tag.kind)) {
        others.push({ line: line.number, tag, context });
      }
    }

    if (lineEffects.length) {
      const used = new Set<string>();
      for (const seg of line.segments) {
        if (seg.type === 'var' && !seg.definition) used.add(seg.name);
        if (seg.type === 'call' && seg.head) used.add(seg.head);
      }
      for (const name of used) {
        const v = sketch.variables[name];
        if (!v?.labels.length) continue;
        for (const effect of lineEffects) flows.push({ line: line.number, variable: name, labels: v.labels, effect });
      }
    }
  }

  return {
    effects,
    systems: [...systems.values()],
    failures,
    flags,
    flows,
    changes,
    labeled: Object.values(sketch.variables).filter((v) => v.labels.length),
    others,
    diagnostics: sketch.diagnostics,
  };
}
