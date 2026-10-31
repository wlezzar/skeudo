import * as vscode from 'vscode';
import type { MarkdownIt } from 'markdown-it';
import markdownItSketch, { type SketchPluginOptions } from 'markdown-it-sketch';
import { srcHref } from './links';

export function activate(context: vscode.ExtensionContext) {
  // The plugin reads these options each time it renders a sketch, so updating them applies new settings.
  const options: SketchPluginOptions = { srcHref };
  const readSettings = () => {
    const settings = vscode.workspace.getConfiguration('sketch');
    options.labelKinds = settings.get<string[]>('labelKinds');
    options.kindColors = settings.get<Record<string, string>>('kindColors');
  };
  readSettings();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('sketch')) return;
      readSettings();
      void vscode.commands.executeCommand('markdown.preview.refresh');
    }),
  );

  // VS Code's Markdown preview calls this with its markdown-it instance.
  return { extendMarkdownIt: (md: MarkdownIt) => md.use(markdownItSketch, options) };
}
