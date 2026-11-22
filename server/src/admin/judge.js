// Runs the tagged test suites and reports pass/fail per Curse / Client Call id, plus any
// untagged (guard) test that fails — those count as regressions.
import { spawn } from 'node:child_process';

export function runSuite(cwd, glob = 'test/**/*.test.js') {
  return new Promise((resolve) => {
    // NODE_TEST_CONTEXT is set when this runs inside a test; the nested run must print its own TAP.
    const env = { ...process.env, NODE_ENV: 'test' };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', glob], { cwd, env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', (err) => resolve({ code: 1, out: String(err) }));
  });
}

// "ok 3 - [E2] hp bar …" / "not ok 4 - [A4] …" -> { results: { E2: true, A4: false }, regressions: [...] }.
// A tag fails if any of its tests fail. Only top-level tests count (subtests are indented).
export function parseTap(tap) {
  const results = {};
  const regressions = [];
  for (const line of tap.split(/\r?\n/)) {
    const m = line.match(/^(not )?ok \d+ - (.*)$/);
    if (!m) continue;
    const pass = !m[1];
    const tag = m[2].match(/^\[([A-Z]\d+)\]/);
    if (tag) results[tag[1]] = (results[tag[1]] ?? true) && pass;
    else if (!pass) regressions.push(m[2].replace(/\s+#.*$/, ''));
  }
  return { results, regressions };
}

export async function runJudge(dirs) {
  const started = Date.now();
  const outputs = await Promise.all(dirs.map((dir) => runSuite(dir)));
  const results = {};
  const regressions = [];
  for (const { out } of outputs) {
    const parsed = parseTap(out);
    for (const [id, pass] of Object.entries(parsed.results)) results[id] = (results[id] ?? true) && pass;
    regressions.push(...parsed.regressions);
  }
  return { results, regressions, ms: Date.now() - started, exitCodes: outputs.map((o) => o.code), outputs };
}
