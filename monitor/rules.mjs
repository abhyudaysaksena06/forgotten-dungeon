// What the event monitor looks for. Only names on these lists are ever reported: the agent never
// sends the full process list, the full extension list, or anything typed or shown on screen.
//
// `allowed: true` marks the AI tools the event permits (Gemini). Everything else here is flagged.
// Edit these lists before the event if you allow or ban other tools.

/**
 * Running programs. `match` is tested against the lower-cased program name. `paths` is tested against
 * the program's full path and command line (lower case, forward slashes), so an app that was renamed
 * but still runs from its install folder, or a CLI started through node or python, is still caught.
 * The command lines are only checked on the student's computer; only the tool name is ever sent.
 */
export const PROCESS_RULES = [
  { tool: 'Gemini CLI', allowed: true, match: [/^gemini(\.exe)?$/], paths: [/@google\/gemini-cli/] },
  { tool: 'Cursor', match: [/^cursor(\.exe)?$/, /^cursor helper/], paths: [/\/cursor\.app\//, /\/programs\/cursor\//, /\.mount_cursor/, /\/cursor\/(cursor|resources)\b/] },
  { tool: 'Windsurf', match: [/^windsurf/], paths: [/\/windsurf\.app\//, /\/programs\/windsurf\//, /\/codeium\/windsurf/] },
  { tool: 'ChatGPT desktop', match: [/^chatgpt(\.exe)?$/], paths: [/\/chatgpt\.app\//, /openai\.chatgpt-desktop/, /\/programs\/chatgpt\//] },
  { tool: 'Claude (desktop or Claude Code)', match: [/^claude(\.exe)?$/], paths: [/\/claude\.app\//, /\/anthropicclaude\//, /@anthropic-ai\/claude-code/, /\.claude\/local\/claude/] },
  { tool: 'OpenAI Codex CLI', match: [/^codex(\.exe)?$/], paths: [/@openai\/codex/] },
  { tool: 'GitHub Copilot', match: [/^copilot(\.exe)?$/, /^copilot-language-server/, /^copilot-agent/], paths: [/@github\/copilot/, /\/github\.copilot(-chat)?-\d/] },
  { tool: 'Aider', match: [/^aider(\.exe)?$/], paths: [/\/bin\/aider\b/, /-m aider\b/, /aider-chat/] },
  { tool: 'Ollama (local models)', match: [/^ollama(\.exe)?$/, /^ollama app/], paths: [/\/ollama\.app\//, /\/programs\/ollama\//] },
  { tool: 'LM Studio (local models)', match: [/^lm studio/, /^lmstudio/, /^lms(\.exe)?$/], paths: [/\/lm studio\.app\//, /\/programs\/lm studio\//, /\/\.lmstudio\//] },
  { tool: 'Jan (local models)', match: [/^jan(\.exe)?$/], paths: [/\/jan\.app\//, /\/programs\/jan\//] },
  { tool: 'GPT4All (local models)', match: [/^gpt4all/], paths: [/\/gpt4all\//] },
  { tool: 'Perplexity desktop', match: [/^perplexity(\.exe)?$/], paths: [/\/perplexity\.app\//, /\/programs\/perplexity\//] },
  { tool: 'Trae', match: [/^trae(\.exe)?$/], paths: [/\/trae\.app\//, /\/programs\/trae\//] },
  { tool: 'Kiro', match: [/^kiro(\.exe)?$/], paths: [/\/kiro\.app\//, /\/programs\/kiro\//] },
  { tool: 'Void editor', match: [/^void(\.exe)?$/], paths: [/\/void\.app\//, /\/programs\/void\//] },
  { tool: 'Tabnine', match: [/^tabnine/], paths: [/\/tabnine\//] },
  { tool: 'Microsoft Copilot app', match: [/^microsoft\.copilot/, /^m365copilot/], paths: [/microsoft\.copilot_/] },
];

/** Editor extensions, matched against `publisher.name` (lower case, version stripped). */
export const EXTENSION_RULES = [
  { tool: 'Gemini Code Assist', allowed: true, ids: ['google.geminicodeassist', 'googlecloudtools.cloudcode'] },
  { tool: 'GitHub Copilot', ids: ['github.copilot', 'github.copilot-chat', 'github.copilot-nightly'] },
  { tool: 'Claude Code', ids: ['anthropic.claude-code'] },
  { tool: 'ChatGPT / Codex', ids: ['openai.chatgpt', 'genieai.chatgpt-vscode', 'danielsanmedium.dscodegpt'] },
  { tool: 'Cline', ids: ['saoudrizwan.claude-dev'] },
  { tool: 'Roo Code', ids: ['rooveterinaryinc.roo-cline'] },
  { tool: 'Kilo Code', ids: ['kilocode.kilo-code'] },
  { tool: 'Continue', ids: ['continue.continue'] },
  { tool: 'Codeium / Windsurf plugin', ids: ['codeium.codeium', 'codeium.windsurfpyright'] },
  { tool: 'Tabnine', ids: ['tabnine.tabnine-vscode'] },
  { tool: 'Amazon Q', ids: ['amazonwebservices.amazon-q-vscode', 'amazonwebservices.aws-toolkit-vscode'] },
  { tool: 'Sourcegraph Cody', ids: ['sourcegraph.cody-ai'] },
  { tool: 'Supermaven', ids: ['supermaven.supermaven'] },
  { tool: 'Blackbox AI', ids: ['blackboxapp.blackbox', 'blackboxapp.blackboxagent'] },
  { tool: 'Qodo', ids: ['codium.codium', 'qodo.qodo-gen'] },
];

/** Editors whose extension folders the agent reads (relative to the home folder). */
export const EXTENSION_DIRS = [
  { editor: 'VS Code', dir: '.vscode/extensions' },
  { editor: 'VS Code Insiders', dir: '.vscode-insiders/extensions' },
  { editor: 'VSCodium', dir: '.vscode-oss/extensions' },
  { editor: 'Cursor', dir: '.cursor/extensions', aiEditor: true },
  { editor: 'Windsurf', dir: '.windsurf/extensions', aiEditor: true },
  { editor: 'Trae', dir: '.trae/extensions', aiEditor: true },
  { editor: 'Kiro', dir: '.kiro/extensions', aiEditor: true },
];

/**
 * Returns the rule a running program matches, or null. Takes a name, or { name, cmd } where cmd is
 * the full path and command line. Allowed tools are checked first, so the Gemini CLI started through
 * node is not mistaken for something else.
 */
export function matchProcess(entry) {
  const { name, cmd } = typeof entry === 'string' ? { name: entry, cmd: '' } : entry;
  const n = String(name ?? '').trim().toLowerCase().split(/[\\/]/).pop();
  const c = String(cmd ?? '').toLowerCase().replaceAll('\\', '/');
  if (!n && !c) return null;
  return PROCESS_RULES.find((r) => (n && r.match.some((re) => re.test(n))) || (c && (r.paths ?? []).some((re) => re.test(c)))) ?? null;
}

/** `github.copilot-1.250.0` or `github.copilot-chat-0.26.1-darwin-arm64` → `github.copilot` / `github.copilot-chat`. */
export function extensionId(folderName) {
  return String(folderName).toLowerCase().replace(/-\d+\.\d+.*$/, '');
}

export function matchExtension(folderName) {
  const id = extensionId(folderName);
  const rule = EXTENSION_RULES.find((r) => r.ids.includes(id));
  return rule ? { ...rule, id } : null;
}

/** Unique, sorted hits from a list of running programs (names, or { name, cmd }). */
export function scanProcesses(entries) {
  const hits = new Map();
  for (const entry of entries) {
    const rule = matchProcess(entry);
    if (rule) hits.set(rule.tool, { tool: rule.tool, allowed: Boolean(rule.allowed) });
  }
  return [...hits.values()].sort((a, b) => a.tool.localeCompare(b.tool));
}
