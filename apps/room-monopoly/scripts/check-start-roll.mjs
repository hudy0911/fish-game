import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workerPath = path.resolve('dist/room.worker.js');
const checkPath = path.resolve('.worker-start-roll-check.mjs');
const source = await readFile(workerPath, 'utf8');
const runnable = source.replace(
  /import\s*\{\s*defineRoom\s*\}\s*from\s*["']@parti\/worker-sdk["'];?/,
  'const defineRoom = (definition) => definition;',
);
if (runnable === source) throw new Error('Unable to replace Parti Worker runtime import');
await writeFile(checkPath, runnable);

try {
  const room = (await import(`${pathToFileURL(checkPath).href}?v=${Date.now()}`)).default;
  const ctx = { state: room.initialState(), broadcast() {}, send() {} };
  const p1 = { id: 'p1', name: 'Alice' };
  const p2 = { id: 'p2', name: 'Bob' };
  room.onJoin(ctx, p1);
  room.onJoin(ctx, p2);
  room.actions.start(ctx, { player: p1 });
  if (ctx.state.phase !== 'turn' || ctx.state.stage !== 'preRoll' || ctx.state.order[ctx.state.turnIndex] !== p1.id) {
    throw new Error('Start did not enter a playable first turn');
  }
  room.actions.roll(ctx, { player: p1 });
  if (!Number.isInteger(ctx.state.dice) || ctx.state.dice < 1 || ctx.state.dice > 6 || ctx.state.stage === 'preRoll') {
    throw new Error('Roll did not advance from preRoll');
  }
  console.log(`✓ start -> roll regression passed (rolled ${ctx.state.dice}, stage ${ctx.state.stage})`);
} finally {
  await unlink(checkPath).catch(() => {});
}
