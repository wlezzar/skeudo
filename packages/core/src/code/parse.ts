import type { Diagnostic } from '../diagnostic';
import { firstLine, splitLines } from '../header';
import type {
  ChangeKind,
  CodeSketch,
  ParseOptions,
  Repo,
  ResolvedSrc,
  Segment,
  Signature,
  SketchLine,
  SrcLocation,
  Tag,
  Variable,
} from './types';

// Grammar pieces (see spec: Grammar).
const NAME = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*`;
const TAG_RE = new RegExp(
  String.raw`::(${NAME})([?~]*)(?::(${NAME}(?:\.${NAME})*|\*))?(?:\[(!?)([^\]\n]*)\])?`,
  'uy',
);
const IDENT_START = /[\p{L}_]/u;
const IDENT_CHAR = /[\p{L}\p{N}_]/u;
const IDENT_RE = /[\p{L}_][\p{L}\p{N}_]*/u;
const LEAD_IDENT_RE = /^[\p{L}_][\p{L}\p{N}_]*/u;
/** A call or member chain: `a.b.c` or `std::fs::read`. */
const CHAIN_RE = /[\p{L}_][\p{L}\p{N}_]*(?:(?:\.|::)[\p{L}_][\p{L}\p{N}_]*)*/uy;
const BINDING_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*=(?![=>])/u;
const WORD_RE = /^[\p{L}][\p{L}\p{N}_'’-]*/u;

const DEFAULT_LABEL_KINDS = ['untrusted', 'secret'];
/** Tag kinds that mark what a commit or pull request did to a line. */
export const CHANGE_KINDS: ReadonlySet<string> = new Set<ChangeKind>(['new', 'changed', 'removed']);
/** Tag kinds that renderers hide: `::src` and `::repo` become links, and `::doc` shows on hover. */
export const HIDDEN_KINDS: ReadonlySet<string> = new Set(['src', 'repo', 'doc']);

/**
 * Finds every tag in a line. A tag starts at the beginning of the text or after whitespace,
 * so code such as `std::io` or `Vec::new()` stays plain text.
 */
export function scanTags(text: string, onWarning?: (message: string) => void): Tag[] {
  const tags: Tag[] = [];
  for (let i = text.indexOf('::'); i !== -1; i = text.indexOf('::', i + 1)) {
    if (i > 0 && !/\s/.test(text[i - 1])) continue;
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(text);
    if (!m) continue;
    const [raw, kind, mods, value, bang, noteText] = m;
    const end = i + raw.length;
    if (noteText === undefined && text[end] === '[') {
      onWarning?.(`The note on ::${kind} is missing its closing "]".`);
    }
    tags.push({
      kind,
      conditional: mods.includes('?'),
      unverified: mods.includes('~'),
      value: value || undefined,
      note: noteText === undefined ? undefined : { text: noteText.trim(), danger: bang === '!' },
      raw,
      start: i,
      end,
      trailing: false,
    });
    i = end - 1;
  }
  return tags;
}

/** Parses text made only of tags, such as inline code `::read?:sys`. Returns undefined otherwise. */
export function parseTagsOnly(text: string): Tag[] | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('::')) return undefined;
  const tags = scanTags(trimmed);
  if (!tags.length) return undefined;
  let cursor = 0;
  for (const t of tags) {
    if (trimmed.slice(cursor, t.start).trim() !== '') return undefined;
    cursor = t.end;
  }
  return trimmed.slice(cursor).trim() === '' ? tags : undefined;
}

/** Parses a `::src` note: `path:start-end`, `path:line`, `path`, or a bare line or range. */
export function parseLocation(text: string): SrcLocation | undefined {
  const s = text.trim();
  if (!s) return undefined;
  let m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(s);
  if (m) return { start: +m[1], end: m[2] ? +m[2] : +m[1] };
  m = /^(.+?):(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(s);
  if (m) return { path: m[1], start: +m[2], end: m[3] ? +m[3] : +m[2] };
  return { path: s };
}

export function formatLocation(loc: SrcLocation): string {
  const range = loc.start === undefined ? '' : loc.end !== undefined && loc.end !== loc.start ? `${loc.start}-${loc.end}` : `${loc.start}`;
  if (loc.path && range) return `${loc.path}:${range}`;
  return loc.path ?? range;
}

/** `scheme://authority/path`, with the path optional. */
const URL_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/\s]*)(\/\S*)?$/i;

/**
 * A remote's host and repository path, ignoring the protocol, the user, the port and a trailing `.git`,
 * so every way of cloning a repository gives the same answer.
 */
function hostAndPath(authority: string, path: string): { host: string; path: string } | undefined {
  const host = authority.replace(/^[^@]*@/, '').replace(/:\d*$/, '').toLowerCase();
  const repoPath = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  return host && repoPath ? { host, path: repoPath } : undefined;
}

/**
 * Parses the URL in a `::repo` note: `git+<remote>@<revision>`, `git+file://<path>@<revision>`, or any
 * other URL, used as a base. Returns undefined when the note isn't a URL.
 */
export function parseRepo(text: string): Repo | undefined {
  const url = text.trim();
  if (/^git\+/i.test(url)) {
    const m = URL_RE.exec(url.slice(4));
    if (!m) return undefined;
    const [, scheme, authority, fullPath = ''] = m;
    // The revision follows the last `@` of the path, so the user in `git+ssh://git@host/…` stays in the remote.
    const at = fullPath.lastIndexOf('@');
    const path = at === -1 ? fullPath : fullPath.slice(0, at);
    const rev = at === -1 ? undefined : fullPath.slice(at + 1).replace(/\/+$/, '') || undefined;
    if (scheme.toLowerCase() === 'file') {
      let folder: string;
      try {
        folder = decodeURIComponent(path);
      } catch {
        return undefined;
      }
      // `file:///C:/code/shop` is `C:/code/shop` on Windows.
      if (/^\/[a-z]:/i.test(folder)) folder = folder.slice(1);
      folder = folder.length > 1 ? folder.replace(/\/+$/, '') : folder;
      return folder ? { type: 'local', url, path: folder, ...(rev ? { rev } : {}) } : undefined;
    }
    const where = hostAndPath(authority, path);
    return where && { type: 'remote', url, remote: `${scheme}://${authority}${path}`, ...where, ...(rev ? { rev } : {}) };
  }
  return URL_RE.test(url) ? { type: 'base', url } : undefined;
}

/**
 * Names a repository by its host and path, as in `github.com/org/shop`, from a remote URL or the
 * `git@host:path` form `git remote` prints. Two remotes with the same name are the same repository.
 * Returns undefined for a local path or `file://` URL.
 */
export function repoId(remote: string): string | undefined {
  const s = remote.trim().replace(/^git\+/i, '');
  const url = URL_RE.exec(s);
  if (url) return url[1].toLowerCase() === 'file' ? undefined : idOf(hostAndPath(url[2], url[3] ?? ''));
  // `git@github.com:org/shop.git`. A single letter before the colon is a Windows drive.
  const scp = /^([^/:\s]{2,}):(?!\/\/)(\S+)$/.exec(s);
  return scp ? idOf(hostAndPath(scp[1], scp[2])) : undefined;
}

const idOf = (where: { host: string; path: string } | undefined) => where && `${where.host}/${where.path}`.toLowerCase();

/** Index of the `)` matching the `(` at `open`, or -1. */
function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if ('([{<'.includes(ch)) depth++;
    else if (')]}>'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseParams(text: string): string[] {
  const params: string[] = [];
  for (let p of splitTopLevel(text)) {
    p = p.trim().replace(/^(?:mut|const|let|var|final|readonly)\s+/, '');
    const m = IDENT_RE.exec(p);
    if (m && !params.includes(m[0])) params.push(m[0]);
  }
  return params;
}

/** Matches `name(params)` at the start of a line. */
function matchSignature(text: string): { name: string; params: string[]; colon: boolean } | undefined {
  CHAIN_RE.lastIndex = 0;
  const m = CHAIN_RE.exec(text);
  if (!m || text[m[0].length] !== '(') return undefined;
  const open = m[0].length;
  const close = findClose(text, open);
  if (close === -1) return undefined;
  return {
    name: m[0],
    params: parseParams(text.slice(open + 1, close)),
    colon: /^\s*:/.test(text.slice(close + 1)),
  };
}

/** Parses a block of the code view. */
export function parseCode(source: string, options: ParseOptions = {}): CodeSketch {
  const labelKinds = new Set(options.labelKinds ?? DEFAULT_LABEL_KINDS);
  const diagnostics: Diagnostic[] = [];
  const warn = (line: number, message: string) => diagnostics.push({ line, severity: 'warning', message });

  const rawLines = splitLines(source);
  while (rawLines.length && rawLines[rawLines.length - 1].trim() === '') rawLines.pop();
  // A `code` header only names the view. It stays a line, left blank, so line numbers still count it.
  const header = firstLine(rawLines);
  if (header?.text === 'code') rawLines[header.index] = '';

  const indents: number[] = [];
  const lines: SketchLine[] = rawLines.map((raw, idx) => {
    const expanded = raw.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
    const text = expanded.trim();
    indents.push(expanded.length - expanded.trimStart().length);
    return {
      number: idx + 1,
      depth: 0,
      text,
      blank: text === '',
      signature: false,
      header: false,
      children: [],
      tags: [],
      segments: [],
      trailingStart: text.length,
      hidden: false,
    };
  });

  // --- Indentation and blocks -------------------------------------------------
  const body = lines.filter((l) => !l.blank);
  const base = body.length ? Math.min(...body.map((l) => indents[l.number - 1])) : 0;
  const levels: number[] = [];
  const lastAtDepth: SketchLine[] = [];
  let indentUnit: number | undefined;
  for (const line of body) {
    const w = indents[line.number - 1] - base;
    if (!levels.length) levels.push(w);
    else if (w > levels[levels.length - 1]) {
      const delta = w - levels[levels.length - 1];
      if (indentUnit === undefined) {
        indentUnit = delta;
        if (delta !== 2 && delta !== 4) warn(line.number, `Indent by 2 or 4 spaces per level, not ${delta}.`);
      } else if (delta !== indentUnit) {
        warn(line.number, `This level is indented by ${delta} spaces; the rest of the sketch uses ${indentUnit}.`);
      }
      levels.push(w);
    } else {
      while (levels.length > 1 && levels[levels.length - 1] > w) levels.pop();
      const top = levels[levels.length - 1];
      if (top !== w) {
        warn(line.number, `This indentation doesn't line up with any enclosing block.`);
        // Less indented than the first line: no block encloses it, so it's at the top level.
        if (w < top) levels[levels.length - 1] = w;
        else levels.push(w);
      }
    }
    line.depth = levels.length - 1;
    const parent = line.depth > 0 ? lastAtDepth[line.depth - 1] : undefined;
    if (parent) {
      line.parent = parent.number;
      parent.children.push(line.number);
      parent.header = true;
    }
    lastAtDepth[line.depth] = line;
    lastAtDepth.length = line.depth + 1;
  }
  // Blank lines keep the guides of the blocks they sit inside.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].blank) continue;
    const prev = lines.slice(0, i).reverse().find((l) => !l.blank);
    const next = lines.slice(i + 1).find((l) => !l.blank);
    lines[i].depth = Math.min(prev?.depth ?? 0, next?.depth ?? 0);
  }

  // --- Signature ----------------------------------------------------------------
  let signature: Signature | undefined;
  const first = body[0];
  if (first && first.depth === 0) {
    const sig = matchSignature(first.text);
    if (sig && (sig.colon || first.header)) {
      first.signature = true;
      signature = { name: sig.name, params: sig.params, line: first.number };
    }
  }

  // --- Tags, bindings, hidden lines, explanations -------------------------------
  const callDocs: Record<string, string> = Object.create(null);
  /** Line of the first `::doc` for each call name, for the warning when the sketch never makes that call. */
  const docLines: Record<string, number> = Object.create(null);
  for (const line of body) {
    line.tags = scanTags(line.text, (msg) => warn(line.number, msg));
    const { tags, text } = line;

    // Tags after the last piece of content go to the tag column.
    let cursor = text.length;
    let k = tags.length;
    while (k > 0 && text.slice(tags[k - 1].end, cursor).trim() === '') {
      k--;
      cursor = tags[k].start;
    }
    if (k < tags.length && text.slice(0, cursor).trim() !== '') {
      for (let j = k; j < tags.length; j++) tags[j].trailing = true;
      line.trailingStart = cursor;
    }

    if (!line.signature) {
      const m = BINDING_RE.exec(text);
      if (m) line.binding = m[1];
    }

    // A line made only of tags that renderers hide has nothing left to show.
    const hiddenTags = tags.filter((t) => HIDDEN_KINDS.has(t.kind));
    let rest = text;
    for (const t of [...hiddenTags].reverse()) rest = rest.slice(0, t.start) + rest.slice(t.end);
    line.hidden = hiddenTags.length > 0 && rest.trim() === '' && !line.header;

    const docs: string[] = [];
    for (const t of tags) {
      if (t.kind !== 'doc') continue;
      if (!t.note?.text) {
        warn(line.number, `::doc needs an explanation in its note, as in ::doc[what the line does].`);
      } else if (t.value) {
        callDocs[t.value] = callDocs[t.value] ? `${callDocs[t.value]}\n${t.note.text}` : t.note.text;
        docLines[t.value] ??= line.number;
      } else if (line.hidden) {
        warn(line.number, `This ::doc has no line to explain. Put it on the line it explains, or name a call, as in ::doc:name[…].`);
      } else {
        docs.push(t.note.text);
      }
    }
    if (docs.length) line.doc = docs.join('\n');

    for (const t of tags) {
      if ((t.kind === 'read' || t.kind === 'write') && !t.value) {
        warn(line.number, `::${t.kind} needs the system it touches, as in ::${t.kind}:postgres.`);
      } else if (t.kind === 'fail' && !t.value) {
        warn(line.number, `::fail needs a name, as in ::fail:NotFound.`);
      } else if (labelKinds.has(t.kind) && !t.value) {
        warn(line.number, `::${t.kind} needs the variable it labels, as in ::${t.kind}:name.`);
      } else if (t.kind === 'src' && !t.note?.text) {
        warn(line.number, `::src needs a location in its note, as in ::src[app/file.py:12-24].`);
      } else if (t.kind === 'repo' && !(t.note && parseRepo(t.note.text))) {
        warn(line.number, `::repo needs a URL in its note, as in ::repo[git+https://github.com/org/repo@a1b2c3d].`);
      } else if (t.kind === 'changed' && !t.note?.text) {
        warn(line.number, `::changed needs a note saying how, as in ::changed[was …].`);
      }
    }
  }

  // --- Variables ----------------------------------------------------------------
  const variables: Record<string, Variable> = Object.create(null);
  const addVar = (name: string, origin: Variable['origin'], line: number) =>
    (variables[name] ??= { name, origin, line, labels: [] });
  if (signature) for (const p of signature.params) addVar(p, 'param', signature.line);
  for (const line of body) if (line.binding) addVar(line.binding, 'binding', line.number);
  for (const line of body) {
    for (const t of line.tags) {
      if (!labelKinds.has(t.kind) || !t.value) continue;
      const v = addVar(t.value, 'label', line.number);
      if (!v.labels.includes(t.kind)) v.labels.push(t.kind);
    }
  }

  // --- Source links ---------------------------------------------------------------
  let file: string | undefined;
  if (first?.signature) {
    const own = first.tags.find((t) => t.kind === 'src' && !t.value && t.note);
    file = own && parseLocation(own.note!.text)?.path;
  }
  const callSources: Record<string, ResolvedSrc> = Object.create(null);
  for (const line of body) {
    for (const t of line.tags) {
      if (t.kind !== 'src' || !t.note) continue;
      const loc = parseLocation(t.note.text);
      if (!loc) continue;
      const resolved: ResolvedSrc = { ...loc, path: loc.path ?? file };
      if (!resolved.path) {
        warn(line.number, `This ::src location has no file. Name the file with a ::src tag on the signature.`);
      }
      if (t.value) callSources[t.value] = resolved;
      else line.src = resolved;
    }
  }
  let repo: Repo | undefined;
  let repoLine = 0;
  for (const line of body) {
    for (const t of line.tags) {
      const named = t.kind === 'repo' && t.note ? parseRepo(t.note.text) : undefined;
      if (!named) continue;
      if (repo) {
        warn(line.number, `This sketch already names its repository on line ${repoLine}; only the first ::repo applies.`);
      } else {
        repo = named;
        repoLine = line.number;
      }
    }
  }
  const byNumber = new Map(lines.map((l) => [l.number, l]));
  for (const line of body) {
    if (line.src || line.parent === undefined) continue;
    const parentSrc = byNumber.get(line.parent)?.src;
    if (parentSrc) line.src = { ...parentSrc, inherited: true };
  }

  // --- Changes --------------------------------------------------------------------
  // A line's own change tag wins; otherwise it takes the change of an enclosing new or removed block.
  for (const line of body) {
    const own = line.tags.find((t) => CHANGE_KINDS.has(t.kind));
    if (own) {
      line.change = { kind: own.kind as ChangeKind, note: own.note?.text || undefined };
      continue;
    }
    const parent = line.parent === undefined ? undefined : byNumber.get(line.parent);
    const outer = parent?.change;
    if (parent && outer && outer.kind !== 'changed') {
      line.change = { kind: outer.kind, from: outer.from ?? parent.number };
    }
  }

  // --- Segments -------------------------------------------------------------------
  const varNames = new Set(Object.keys(variables));
  for (const line of body) line.segments = tokenize(line, varNames);

  const called = new Set(body.flatMap((l) => l.segments.flatMap((s) => (s.type === 'call' ? [s.name] : []))));
  for (const [name, line] of Object.entries(docLines)) {
    if (!called.has(name)) {
      warn(line, `The sketch never calls ${name}, so this ::doc explains nothing. Write the name as the call is written, as in ::doc:cache.set[…].`);
    }
  }

  return { view: 'code', source, signature, file, repo, indentUnit, lines, variables, callSources, callDocs, diagnostics };
}

/** Splits the content part of a line (everything before the tag column) into segments. */
function tokenize(line: SketchLine, vars: Set<string>): Segment[] {
  const { text, tags, trailingStart } = line;
  const segs: Segment[] = [];
  const tagAt = new Map(tags.map((t) => [t.start, t]));
  let buf = '';
  const flush = () => {
    if (buf) segs.push({ type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  let fnPending = line.signature;
  let inParams = false;

  // First word of a prose line or block header.
  if (!line.signature && !line.binding && !tagAt.has(0)) {
    const m = WORD_RE.exec(text);
    if (m) {
      const w = m[0];
      const next = text[w.length];
      const codeLike = next === '(' || next === '.' || (next === ':' && text[w.length + 1] === ':');
      // The line starts with a tracked variable, as in `cached is stale` or `user's team`,
      // unless it is part of a hyphenated word such as `token-rotated`.
      const lead = LEAD_IDENT_RE.exec(text)![0];
      const leadIsVar =
        vars.has(lead) && !(text[lead.length] === '-' && IDENT_START.test(text[lead.length + 1] ?? ''));
      if (!codeLike && !leadIsVar) {
        segs.push({ type: 'word', text: w });
        i = w.length;
      }
    }
  }

  while (i < trailingStart) {
    const tag = tagAt.get(i);
    if (tag) {
      flush();
      segs.push({ type: 'tag', tag });
      i = tag.end;
      continue;
    }
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (IDENT_START.test(ch) && !IDENT_CHAR.test(prev)) {
      CHAIN_RE.lastIndex = i;
      const chain = CHAIN_RE.exec(text)![0];
      const after = i + chain.length;
      // Member access, as in `user.id`. A spread or range, as in `...rest` or `0..n`, is not.
      const afterDot = prev === '.' && text[i - 2] !== '.';
      if (text[after] === '(' && findClose(text, after) !== -1) {
        flush();
        if (fnPending) {
          segs.push({ type: 'fn', text: chain });
          fnPending = false;
          inParams = true;
        } else {
          const head = IDENT_RE.exec(chain)![0];
          const hasHead = !afterDot && head !== chain && vars.has(head) && chain[head.length] === '.';
          segs.push({ type: 'call', text: chain, name: chain, head: hasHead ? head : undefined });
        }
        i = after;
        continue;
      }
      const head = IDENT_RE.exec(chain)![0];
      // `token-rotated` is a hyphenated word, not a use of `token`.
      const hyphenated =
        (prev === '-' && IDENT_CHAR.test(text[i - 2] ?? '')) ||
        (head === chain && text[after] === '-' && IDENT_START.test(text[after + 1] ?? ''));
      if (!afterDot && !hyphenated && vars.has(head) && chain[head.length] !== ':') {
        flush();
        const definition = (line.binding === head && i === 0) || (line.signature && inParams);
        segs.push({ type: 'var', text: head, name: head, definition });
        buf += chain.slice(head.length);
        i = after;
        continue;
      }
      buf += chain;
      i = after;
      continue;
    }
    if (ch === ')' && inParams) inParams = false;
    buf += ch;
    i++;
  }
  flush();
  const last = segs[segs.length - 1];
  if (last?.type === 'text') {
    last.text = last.text.trimEnd();
    if (!last.text) segs.pop();
  }
  return segs;
}
