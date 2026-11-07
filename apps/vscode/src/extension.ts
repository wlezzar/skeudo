import * as vscode from 'vscode';
import type { MarkdownIt } from 'markdown-it';
import type { GitHost } from '@skeudo/html';
import markdownItSkeudo, { type SkeudoPluginOptions } from 'markdown-it-skeudo';
import { Git } from './git';
import { createSrcHref } from './links';

/** Where the extension keeps the repositories it has seen open: repository → local folder. */
const REMEMBERED = 'repositories';

export function activate(context: vscode.ExtensionContext) {
  const git = new Git();
  const trustedGit = () => (vscode.workspace.isTrusted ? git : undefined);
  const workspaceFolders = () => (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file').map((f) => f.uri.fsPath);
  let repositories: Record<string, string> = {};
  let gitHosts: Record<string, GitHost> = {};

  // The plugin reads these options each time it renders a sketch, so updating them applies new settings.
  const options: SkeudoPluginOptions = {
    srcHref: createSrcHref({
      git: trustedGit,
      repositories: () => repositories,
      gitHosts: () => gitHosts,
      workspaceFolders,
      remembered: () => context.globalState.get<Record<string, string>>(REMEMBERED) ?? {},
    }),
  };
  const readSettings = () => {
    const settings = vscode.workspace.getConfiguration('skeudo');
    options.labelKinds = settings.get<string[]>('labelKinds');
    options.kindColors = settings.get<Record<string, string>>('kindColors');
    repositories = settings.get<Record<string, string>>('repositories') ?? {};
    gitHosts = settings.get<Record<string, GitHost>>('gitHosts') ?? {};
  };
  readSettings();

  // Records the repositories open in this window, so sketches previewed in other windows can link to them.
  const remember = async () => {
    const g = trustedGit();
    if (!g) return;
    const known = { ...context.globalState.get<Record<string, string>>(REMEMBERED) };
    for (const folder of workspaceFolders()) {
      const found = await g.describe(folder);
      for (const id of found?.remotes ?? []) known[id] = found!.root;
    }
    await context.globalState.update(REMEMBERED, known);
  };
  void remember();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('skeudo')) return;
      readSettings();
      void vscode.commands.executeCommand('markdown.preview.refresh');
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void remember()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void remember()),
  );

  // VS Code's Markdown preview calls this with its markdown-it instance.
  return { extendMarkdownIt: (md: MarkdownIt) => md.use(markdownItSkeudo, options) };
}
