import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const work = path.join(root, '.local-build');
const compiled = path.join(work, 'compiled');
const dist = path.join(root, 'dist-local');
rmSync(work, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(compiled, { recursive: true });
mkdirSync(path.join(dist, 'assets'), { recursive: true });

console.log('1/5 TypeScript typecheck');
execFileSync('tsc', ['--noEmit', '--pretty', 'false'], { cwd: root, stdio: 'inherit' });

console.log('2/5 Local equivalent build');
execFileSync('tsc', ['-p', 'tsconfig.json', '--noEmit', 'false', '--outDir', compiled, '--sourceMap', 'false'], { cwd: root, stdio: 'inherit' });
cpSync(path.join(root, 'public', 'parti.room.json'), path.join(dist, 'parti.room.json'));
cpSync(path.join(root, 'src', 'ui', 'style.css'), path.join(dist, 'assets', 'style.css'));
let uiSource = readFileSync(path.join(compiled, 'ui', 'main.js'), 'utf8').replace("import './style.css';", '');
writeFileSync(path.join(dist, 'assets', 'main.js'), uiSource);
let html = readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/ui/main.ts"></script>', '<link rel="stylesheet" href="./assets/style.css"><script type="module" src="./assets/main.js"></script>');
writeFileSync(path.join(dist, 'index.html'), html);
cpSync(path.join(compiled, 'worker', 'index.js'), path.join(dist, 'room.worker.js'));

console.log('3/5 Package contract checks');
for (const file of ['parti.room.json', 'index.html', 'room.worker.js']) {
  if (!existsSync(path.join(dist, file))) throw new Error(`Missing ${file}`);
}
const workerSource = readFileSync(path.join(dist, 'room.worker.js'), 'utf8');
if (!workerSource.includes("from '@parti/worker-sdk'")) throw new Error('Worker lost @parti/worker-sdk runtime import');
if (!workerSource.includes('defineRoom')) throw new Error('Worker lost defineRoom');
if (/from\s+['"]\.\.?\//.test(workerSource)) throw new Error('Worker contains relative imports');
const manifest = JSON.parse(readFileSync(path.join(dist, 'parti.room.json'), 'utf8'));
if (manifest.entry?.ui !== 'index.html' || manifest.entry?.worker !== 'room.worker.js') throw new Error('Manifest entries mismatch output');
if (manifest.room?.minPlayers !== 2 || manifest.room?.maxPlayers !== 6) throw new Error('Manifest player count mismatch');

console.log('4/5 Worker smoke simulation');
const runtimeWorker = path.join(work, 'worker-runtime.mjs');
writeFileSync(runtimeWorker, workerSource.replace("import { defineRoom } from '@parti/worker-sdk';", 'const defineRoom = (definition) => definition;'));
const room = (await import(pathToFileURL(runtimeWorker).href + `?v=${Date.now()}`)).default;
const ctx = { state: room.initialState(), broadcast() {}, send() {} };
const p1 = { id: 'p1', name: 'Alice' };
const p2 = { id: 'p2', name: 'Bob' };
room.onJoin(ctx, p1);
room.onJoin(ctx, p2);
if (ctx.state.order.length !== 2 || ctx.state.config.tiles.length !== 32) throw new Error('Join/map initialization failed');
if (Object.keys(ctx.state.config.districts).length !== 6) throw new Error('District configuration failed');
room.actions.start(ctx, { player: p1 });
if (ctx.state.phase !== 'turn' || ctx.state.stage !== 'preRoll') throw new Error('Start action failed');

ctx.state.stage = 'landingDecision';
ctx.state.pendingPropertyId = 1;
room.actions.buyProperty(ctx, { player: p1 });
if (ctx.state.properties['1'].ownerId !== 'p1' || ctx.state.players.p1.cash !== 13200) throw new Error('Property purchase failed');
room.actions.upgrade(ctx, { player: p1, payload: { tileId: 1 } });
if (ctx.state.properties['1'].level !== 2 || ctx.state.stockPrices.harbor !== 115) throw new Error('Upgrade/stock linkage failed');
ctx.state.bankAccess = true;
room.actions.stockBuy(ctx, { player: p1, payload: { district: 'harbor', qty: 5 } });
if (ctx.state.players.p1.stocks.harbor !== 5) throw new Error('Stock buy failed');

ctx.state.players.p1.position = 7;
ctx.state.stage = 'routeChoice';
ctx.state.pendingMove = { remaining: 1, choices: [8, 10] };
room.actions.chooseRoute(ctx, { player: p1, payload: { target: 10 } });
if (ctx.state.players.p1.position !== 10 || ctx.state.stage !== 'manage' || !ctx.state.bankAccess) throw new Error('Route choice/bank landing failed');

ctx.state.properties['2'].ownerId = 'p2';
ctx.state.players.p2.properties.push(2);
ctx.state.stage = 'manage';
ctx.state.turnIndex = 0;
room.actions.proposeTrade(ctx, { player: p1, payload: { targetId: 'p2', cashGive: 500, cashReceive: 0, propertyGive: null, propertyReceive: 2 } });
if (!ctx.state.trade) throw new Error('Trade proposal failed');
room.actions.respondTrade(ctx, { player: p2, payload: { accept: true } });
if (ctx.state.properties['2'].ownerId !== 'p1' || ctx.state.trade) throw new Error('Trade settlement failed');

ctx.state.turnIndex = 1;
ctx.state.stage = 'manage';
ctx.state.players.p2.cards.push('taxAudit');
ctx.state.players.p1.cash = 100;
room.actions.useCard(ctx, { player: p2, payload: { kind: 'taxAudit', targetId: 'p1' } });
if (ctx.state.players.p1.bankruptcies !== 1 || ctx.state.players.p1.restTurns !== 1 || ctx.state.players.p1.properties.length !== 0) throw new Error('Bankruptcy cleanup failed');
room.actions.endTurn(ctx, { player: p2 });
if (ctx.state.players.p1.cash !== 5000 || ctx.state.players.p1.restTurns !== 0) throw new Error('Bankruptcy rescue/skip failed');

ctx.state.round = 20;
ctx.state.turnIndex = 1;
ctx.state.stage = 'manage';
room.actions.endTurn(ctx, { player: p2 });
if (ctx.state.phase !== 'finished' || !ctx.state.winnerId) throw new Error('20-round finish failed');

console.log('5/5 UI/build sanity checks');
if (!html.includes('assets/main.js') || !readFileSync(path.join(dist, 'assets', 'style.css'), 'utf8').includes('.board')) throw new Error('UI output incomplete');
console.log('✓ All local validation checks passed');
console.log(`✓ Local equivalent package: ${dist}`);
