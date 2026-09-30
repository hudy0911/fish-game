import './style.css';

type DistrictId = 'harbor' | 'oldtown' | 'tech' | 'garden' | 'finance' | 'skyline';

type GameState = any;

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="game-shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">PARTI ROOM</div>
        <h1>城市大亨</h1>
      </div>
      <div id="round-pill" class="round-pill">等待开局</div>
    </header>

    <section class="game-layout">
      <div class="board-wrap">
        <div id="board" class="board" aria-label="游戏棋盘"></div>
        <div class="board-center">
          <div id="center-status" class="center-status"></div>
          <div id="dice" class="dice">?</div>
          <div id="turn-hint" class="turn-hint"></div>
        </div>
      </div>

      <aside class="side-panel">
        <section class="panel me-panel">
          <div class="panel-title">我的资产</div>
          <div id="me-summary"></div>
        </section>
        <section class="panel controls-panel">
          <div class="panel-title">行动</div>
          <div id="controls" class="controls"></div>
        </section>
        <section class="panel market-panel">
          <div class="panel-title">城区行情</div>
          <div id="market"></div>
        </section>
      </aside>
    </section>

    <section class="bottom-grid">
      <div class="panel players-panel">
        <div class="panel-title">玩家排名</div>
        <div id="players"></div>
      </div>
      <div class="panel log-panel">
        <div class="panel-title">城市动态</div>
        <div id="log"></div>
      </div>
    </section>

    <div id="toast" class="toast" aria-live="polite"></div>
  </main>
`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const boardEl = $('#board');
const controlsEl = $('#controls');
const marketEl = $('#market');
const playersEl = $('#players');
const logEl = $('#log');
const meSummaryEl = $('#me-summary');
const roundPillEl = $('#round-pill');
const centerStatusEl = $('#center-status');
const turnHintEl = $('#turn-hint');
const diceEl = $('#dice');
const toastEl = $('#toast');

let state: GameState | null = null;
let tileEls: HTMLElement[] = [];
let toastTimer = 0;
let lastControlsKey = '';

const districtClass: Record<DistrictId, string> = {
  harbor: 'd-harbor', oldtown: 'd-oldtown', tech: 'd-tech', garden: 'd-garden', finance: 'd-finance', skyline: 'd-skyline',
};

function money(value: number) {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

function boardPos(id: number) {
  if (id <= 8) return { row: 1, col: id + 1 };
  if (id <= 16) return { row: id - 7, col: 9 };
  if (id <= 24) return { row: 9, col: 25 - id };
  return { row: 33 - id, col: 1 };
}

function currentPlayerId() {
  return state?.order?.[state.turnIndex] ?? null;
}

function myPlayer() {
  return state?.players?.[parti.playerId] ?? null;
}

function tileIcon(tile: any) {
  if (tile.kind === 'start') return '🏦';
  if (tile.kind === 'chance') return '🃏';
  if (tile.kind === 'tax') return '🧾';
  if (tile.kind === 'bank') return '💹';
  if (tile.kind === 'rest') return '🌿';
  if (tile.kind === 'transit') return tile.next?.length > 1 ? '🔀' : '🚉';
  return state?.config?.districts?.[tile.district]?.icon ?? '🏠';
}

function netWorth(player: any) {
  if (!state || !player) return 0;
  const propertyValue = (player.properties || []).reduce((sum: number, id: number) => {
    const tile = state.config.tiles[id];
    const prop = state.properties[String(id)];
    return sum + (tile.price || 0) + Math.max(0, (prop?.level || 1) - 1) * (tile.upgradeCost || 0);
  }, 0);
  const stockValue = Object.entries(player.stocks || {}).reduce((sum, [district, qty]) => sum + Number(qty) * Number(state.stockPrices[district] || 0), 0);
  return player.cash + propertyValue + stockValue - player.bankruptcies * 3000;
}

function initBoard() {
  if (!state || tileEls.length) return;
  tileEls = state.config.tiles.map((tile: any) => {
    const el = document.createElement('article');
    const pos = boardPos(tile.id);
    el.className = `tile ${tile.district ? districtClass[tile.district as DistrictId] : ''}`;
    el.style.gridRow = String(pos.row);
    el.style.gridColumn = String(pos.col);
    el.innerHTML = `<div class="tile-icon">${tileIcon(tile)}</div><div class="tile-name">${escapeHtml(tile.name)}</div><div class="tile-meta"></div><div class="tokens"></div>`;
    boardEl.appendChild(el);
    return el;
  });
}

function renderBoard() {
  if (!state) return;
  initBoard();
  state.config.tiles.forEach((tile: any, id: number) => {
    const el = tileEls[id];
    const prop = state.properties[String(id)];
    const owner = prop?.ownerId ? state.players[prop.ownerId] : null;
    const meta = el.querySelector<HTMLElement>('.tile-meta')!;
    const tokens = el.querySelector<HTMLElement>('.tokens')!;
    if (tile.kind === 'property') {
      meta.textContent = owner ? `Lv${prop.level} · ${owner.name}` : `¥${money(tile.price)}`;
      el.classList.toggle('owned', Boolean(owner));
      el.classList.toggle('blackout', Boolean(prop?.blackoutUntilRound >= state.round));
    } else if (tile.kind === 'tax') {
      meta.textContent = `-¥${money(tile.tax)}`;
    } else if (tile.kind === 'transit' && tile.next?.length > 1) {
      meta.textContent = '选择路线';
    } else {
      meta.textContent = '';
    }
    const here = state.order.filter((pid: string) => state.players[pid]?.position === id);
    tokens.innerHTML = here.map((pid: string, idx: number) => `<span class="token token-${idx % 6}" title="${escapeHtml(state.players[pid].name)}">${idx + 1}</span>`).join('');
    el.classList.toggle('active-tile', state.pendingPropertyId === id || (state.pendingMove?.choices || []).includes(id));
  });
}

function action(name: string, payload?: unknown) {
  parti.action(name, payload);
}

function btn(label: string, actionName: string, payload?: unknown, cls = '') {
  const encoded = encodeURIComponent(JSON.stringify(payload ?? null));
  return `<button class="action-btn ${cls}" data-action="${actionName}" data-payload="${encoded}">${label}</button>`;
}

function select(id: string, options: Array<{ value: string | number; label: string }>) {
  return `<select id="${id}" class="field">${options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>`;
}

function renderControls() {
  if (!state) return;
  const me = myPlayer();
  const turnId = currentPlayerId();
  const isMyTurn = turnId === parti.playerId;
  const controlKey = JSON.stringify({
    phase: state.phase, stage: state.stage, turnId, round: state.round, pendingPropertyId: state.pendingPropertyId,
    choices: state.pendingMove?.choices, auction: state.auction, trade: state.trade, bankAccess: state.bankAccess,
    myCash: me?.cash, myCards: me?.cards, myProps: me?.properties?.map((id: number) => [id, state.properties[String(id)]?.level]),
    stockPrices: state.stockPrices, playerProps: state.order.map((id: string) => [id, state.players[id]?.properties]),
  });
  if (controlKey === lastControlsKey) return;
  lastControlsKey = controlKey;
  let html = '';

  if (state.phase === 'lobby') {
    html += `<p class="hint">已加入 ${state.order.length}/6 人。至少 2 人可开始。</p>`;
    if (me && state.order.length >= 2) html += btn('开始游戏', 'start', undefined, 'primary');
  } else if (state.phase === 'finished') {
    const winner = state.players[state.winnerId];
    html += `<div class="result-card"><strong>🏆 ${escapeHtml(winner?.name || '玩家')} 获胜</strong><span>${escapeHtml(state.finishReason || '')}</span></div>`;
    if (me) html += btn('再来一局', 'restart', undefined, 'primary');
  } else if (state.stage === 'auction' && state.auction) {
    const a = state.auction;
    const highest = a.highestBidderId ? state.players[a.highestBidderId]?.name : '暂无';
    html += `<p class="hint">拍卖「${escapeHtml(state.config.tiles[a.tileId].name)}」<br>当前 ¥${money(a.currentBid)} · ${escapeHtml(highest)}</p>`;
    if (me && !a.passed.includes(parti.playerId)) {
      if (a.highestBidderId !== parti.playerId) {
        const min = a.currentBid ? a.currentBid + 100 : 100;
        html += `<div class="inline"><input id="auction-amount" class="field" type="number" min="${min}" step="100" value="${min}"><button class="action-btn primary" id="auction-bid">出价</button></div>`;
        html += btn('放弃拍卖', 'auctionPass');
      } else html += `<p class="success">你当前领先，等待其他玩家。</p>`;
    } else html += `<p class="hint">你已放弃，等待拍卖结束。</p>`;
  } else if (!isMyTurn) {
    html += `<p class="hint">等待 <strong>${escapeHtml(state.players[turnId]?.name || '玩家')}</strong> 行动。</p>`;
  } else if (state.stage === 'preRoll') {
    html += btn('🎲 掷骰子', 'roll', undefined, 'primary big');
    html += renderCards(me, 'preRoll');
  } else if (state.stage === 'routeChoice') {
    html += `<p class="hint">前方出现岔路，选择下一格：</p>`;
    html += (state.pendingMove?.choices || []).map((id: number) => btn(`${tileIcon(state.config.tiles[id])} ${escapeHtml(state.config.tiles[id].name)}`, 'chooseRoute', { target: id }, 'primary')).join('');
  } else if (state.stage === 'landingDecision') {
    const tile = state.config.tiles[state.pendingPropertyId];
    html += `<div class="property-offer"><strong>${escapeHtml(tile.name)}</strong><span>${state.config.districts[tile.district].name} · ¥${money(tile.price)}</span></div>`;
    html += btn(`购买 ¥${money(tile.price)}`, 'buyProperty', undefined, me?.cash >= tile.price ? 'primary' : 'disabled');
    html += btn('放弃并公开拍卖', 'declineProperty');
  } else if (state.stage === 'manage') {
    html += `<p class="hint">经营阶段：升级、股票、卡牌或交易，然后结束回合。</p>`;
    const ownedUpgradeable = (me?.properties || []).filter((id: number) => state.properties[String(id)]?.level < 4);
    if (ownedUpgradeable.length) {
      html += `<div class="control-group"><label>地产升级</label>${select('upgrade-tile', ownedUpgradeable.map((id: number) => ({ value: id, label: `${state.config.tiles[id].name} · Lv${state.properties[String(id)].level} → Lv${state.properties[String(id)].level + 1} · ¥${money(state.config.tiles[id].upgradeCost)}` })))}<button id="upgrade-btn" class="action-btn">升级</button></div>`;
    }
    if (state.bankAccess) html += renderStockControls();
    html += renderCards(me, 'manage');
    html += renderTradeControls(me);
    html += btn('结束回合', 'endTurn', undefined, 'primary');
  }

  if (state.trade?.targetId === parti.playerId) {
    const t = state.trade;
    const p = state.players[t.proposerId];
    html = `<div class="trade-incoming"><strong>🤝 ${escapeHtml(p?.name)} 发来交易</strong><span>${tradeSummary(t)}</span>${btn('接受', 'respondTrade', { accept: true }, 'primary')}${btn('拒绝', 'respondTrade', { accept: false })}</div>` + html;
  }

  controlsEl.innerHTML = html || '<p class="hint">等待状态更新…</p>';
  wireDynamicControls();
}

function renderCards(me: any, stage: 'preRoll' | 'manage') {
  if (!me?.cards?.length) return '';
  const labels = state.config.cardLabels;
  const cards = me.cards.map((kind: string, i: number) => `<button class="card-chip" data-card="${kind}" data-index="${i}">${escapeHtml(labels[kind])}</button>`).join('');
  return `<div class="control-group"><label>策略卡</label><div class="card-row">${cards}</div><div class="hint mini">点击卡牌后按效果选择目标；不符合当前阶段的卡不会生效。</div></div>`;
}

function renderStockControls() {
  const districts = Object.entries(state.config.districts).map(([id, d]: any) => ({ value: id, label: `${d.icon} ${d.name} · ¥${state.stockPrices[id]}/股` }));
  return `<div class="control-group"><label>股票交易</label><div class="inline">${select('stock-district', districts)}<input id="stock-qty" class="field qty" type="number" min="1" max="50" value="5"></div><div class="inline"><button id="stock-buy" class="action-btn">买入</button><button id="stock-sell" class="action-btn">卖出</button></div></div>`;
}

function renderTradeControls(me: any) {
  if (state.trade) return `<p class="hint">已有交易等待回应。</p>`;
  const others = state.order.filter((id: string) => id !== parti.playerId).map((id: string) => ({ value: id, label: state.players[id].name }));
  if (!others.length) return '';
  const ownProps = [{ value: '', label: '不提供地产' }, ...(me.properties || []).map((id: number) => ({ value: id, label: state.config.tiles[id].name }))];
  return `<details class="trade-box"><summary>发起简单交易</summary><div class="control-group">${select('trade-target', others)}<input id="trade-give-cash" class="field" type="number" min="0" value="0" placeholder="我支付现金">${select('trade-give-property', ownProps)}<div id="trade-target-property-wrap"></div><button id="trade-send" class="action-btn">发送报价</button></div></details>`;
}

function tradeSummary(t: any) {
  const chunks = [];
  if (t.cashGive) chunks.push(`对方支付 ¥${money(t.cashGive)}`);
  if (t.cashReceive) chunks.push(`希望你支付 ¥${money(t.cashReceive)}`);
  if (t.propertyGive != null) chunks.push(`给你「${state.config.tiles[t.propertyGive].name}」`);
  if (t.propertyReceive != null) chunks.push(`希望获得「${state.config.tiles[t.propertyReceive].name}」`);
  return chunks.join('；');
}

function wireDynamicControls() {
  controlsEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.onclick = () => {
      if (button.classList.contains('disabled')) return;
      const payload = JSON.parse(decodeURIComponent(button.dataset.payload || 'null'));
      action(button.dataset.action!, payload ?? undefined);
    };
  });

  const auctionBid = $('#auction-bid') as HTMLButtonElement | null;
  if (auctionBid) auctionBid.onclick = () => action('auctionBid', { amount: Number(($('#auction-amount') as HTMLInputElement).value) });

  const upgrade = $('#upgrade-btn') as HTMLButtonElement | null;
  if (upgrade) upgrade.onclick = () => action('upgrade', { tileId: Number(($('#upgrade-tile') as HTMLSelectElement).value) });

  const stockBuy = $('#stock-buy') as HTMLButtonElement | null;
  const stockSell = $('#stock-sell') as HTMLButtonElement | null;
  if (stockBuy) stockBuy.onclick = () => stockAction('stockBuy');
  if (stockSell) stockSell.onclick = () => stockAction('stockSell');

  const tradeTarget = $('#trade-target') as HTMLSelectElement | null;
  if (tradeTarget) {
    const updateTargetProps = () => {
      const target = state.players[tradeTarget.value];
      const options = [{ value: '', label: '不索要地产' }, ...(target?.properties || []).map((id: number) => ({ value: id, label: state.config.tiles[id].name }))];
      const wrap = $('#trade-target-property-wrap');
      if (wrap) wrap.innerHTML = `${select('trade-receive-property', options)}<input id="trade-receive-cash" class="field" type="number" min="0" value="0" placeholder="希望对方支付现金">`;
    };
    tradeTarget.onchange = updateTargetProps;
    updateTargetProps();
    const send = $('#trade-send') as HTMLButtonElement | null;
    if (send) send.onclick = () => {
      const giveProp = ($('#trade-give-property') as HTMLSelectElement).value;
      const receiveProp = ($('#trade-receive-property') as HTMLSelectElement).value;
      action('proposeTrade', {
        targetId: tradeTarget.value,
        cashGive: Number(($('#trade-give-cash') as HTMLInputElement).value || 0),
        cashReceive: Number(($('#trade-receive-cash') as HTMLInputElement).value || 0),
        propertyGive: giveProp === '' ? null : Number(giveProp),
        propertyReceive: receiveProp === '' ? null : Number(receiveProp),
      });
    };
  }

  controlsEl.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((button) => {
    button.onclick = () => useCardInteractive(button.dataset.card!);
  });
}

function stockAction(name: 'stockBuy' | 'stockSell') {
  action(name, {
    district: ($('#stock-district') as HTMLSelectElement).value,
    qty: Number(($('#stock-qty') as HTMLInputElement).value),
  });
}

function useCardInteractive(kind: string) {
  const me = myPlayer();
  if (!me) return;
  if (kind === 'exact') {
    const value = Number(window.prompt('遥控骰子：输入 1–6', '6'));
    if (value >= 1 && value <= 6) action('useCard', { kind, value });
    return;
  }
  if (kind === 'insider' || kind === 'marketBoom') {
    const district = chooseOne('选择城区编号', Object.entries(state.config.districts).map(([id, d]: any) => ({ id, label: `${d.icon}${d.name}` })));
    if (district) action('useCard', { kind, district });
    return;
  }
  if (kind === 'upgrade') {
    const ids = me.properties.filter((id: number) => state.properties[String(id)].level < 4);
    const tileId = chooseOne('选择免费升级地产', ids.map((id: number) => ({ id: String(id), label: state.config.tiles[id].name })));
    if (tileId) action('useCard', { kind, tileId: Number(tileId) });
    return;
  }
  if (kind === 'blackout') {
    const ids = Object.keys(state.properties).map(Number).filter((id) => state.properties[String(id)].ownerId && state.properties[String(id)].ownerId !== parti.playerId);
    const tileId = chooseOne('选择停电地产', ids.map((id) => ({ id: String(id), label: state.config.tiles[id].name })));
    if (tileId) action('useCard', { kind, tileId: Number(tileId) });
    return;
  }
  if (kind === 'taxAudit') {
    const targetId = chooseOne('选择审计玩家', state.order.filter((id: string) => id !== parti.playerId).map((id: string) => ({ id, label: state.players[id].name })));
    if (targetId) action('useCard', { kind, targetId });
    return;
  }
  if (kind === 'swap') {
    const targetId = chooseOne('选择交换玩家', state.order.filter((id: string) => id !== parti.playerId && state.players[id].properties.length).map((id: string) => ({ id, label: state.players[id].name })));
    if (!targetId) return;
    const giveId = chooseOne('选择你要给出的地产', me.properties.map((id: number) => ({ id: String(id), label: `${state.config.tiles[id].name} Lv${state.properties[String(id)].level}` })));
    if (!giveId) return;
    const level = state.properties[giveId].level;
    const candidates = state.players[targetId].properties.filter((id: number) => state.properties[String(id)].level === level);
    const receiveId = chooseOne('选择同等级目标地产', candidates.map((id: number) => ({ id: String(id), label: `${state.config.tiles[id].name} Lv${level}` })));
    if (receiveId) action('useCard', { kind, targetId, giveTileId: Number(giveId), receiveTileId: Number(receiveId) });
    return;
  }
  action('useCard', { kind });
}

function chooseOne(title: string, options: Array<{ id: string; label: string }>) {
  if (!options.length) {
    showToast('当前没有合法目标');
    return null;
  }
  const body = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  const value = Number(window.prompt(`${title}\n${body}`, '1'));
  return Number.isInteger(value) && value >= 1 && value <= options.length ? options[value - 1].id : null;
}

function renderMarket() {
  if (!state) return;
  marketEl.innerHTML = Object.entries(state.config.districts).map(([id, d]: any) => {
    const mine = myPlayer()?.stocks?.[id] || 0;
    return `<div class="market-row"><span>${d.icon} ${escapeHtml(d.name)}</span><strong>¥${money(state.stockPrices[id])}</strong><small>持有 ${mine}</small></div>`;
  }).join('');
}

function renderPlayers() {
  if (!state) return;
  const ranked = state.order.map((id: string) => state.players[id]).filter(Boolean).sort((a: any, b: any) => netWorth(b) - netWorth(a));
  playersEl.innerHTML = ranked.map((p: any, index: number) => `<div class="player-row ${p.id === currentPlayerId() ? 'turn-player' : ''} ${p.id === parti.playerId ? 'me' : ''}"><span class="rank">#${index + 1}</span><span class="player-name">${escapeHtml(p.name)}${p.restTurns ? ' ⏸️' : ''}</span><span>现金 ¥${money(p.cash)}</span><strong>资产 ¥${money(netWorth(p))}</strong><small>🏠 ${p.properties.length} · 💥 ${p.bankruptcies}</small></div>`).join('');
}

function renderMe() {
  const me = myPlayer();
  if (!me) {
    meSummaryEl.innerHTML = '<p class="hint">正在加入房间…</p>';
    return;
  }
  const propertyNames = me.properties.map((id: number) => `${state.config.tiles[id].name} Lv${state.properties[String(id)].level}`);
  meSummaryEl.innerHTML = `<div class="asset-total">¥${money(netWorth(me))}<small>净资产</small></div><div class="asset-strip"><span>现金 ¥${money(me.cash)}</span><span>地产 ${me.properties.length}</span><span>卡牌 ${me.cards.length}</span><span>破产 ${me.bankruptcies}</span></div>${propertyNames.length ? `<div class="property-mini-list">${propertyNames.map((x: string) => `<span>${escapeHtml(x)}</span>`).join('')}</div>` : ''}`;
}

function renderStatus() {
  if (!state) return;
  roundPillEl.textContent = state.phase === 'lobby' ? `大厅 · ${state.order.length}/6` : state.phase === 'finished' ? '游戏结束' : `第 ${state.round}/20 轮`;
  diceEl.textContent = state.dice ?? '?';
  const turn = state.players[currentPlayerId()];
  if (state.phase === 'lobby') {
    centerStatusEl.textContent = '等待玩家集结';
    turnHintEl.textContent = '2–6 人 · 20 轮净资产决胜';
  } else if (state.phase === 'finished') {
    centerStatusEl.textContent = `🏆 ${state.players[state.winnerId]?.name || '玩家'} 获胜`;
    turnHintEl.textContent = state.finishReason || '';
  } else {
    centerStatusEl.textContent = `${turn?.name || '玩家'} 的回合`;
    const stageLabel: Record<string, string> = { preRoll: '等待掷骰', routeChoice: '选择路线', landingDecision: '决定是否购买', auction: '公开拍卖', manage: '经营阶段' };
    turnHintEl.textContent = stageLabel[state.stage] || state.stage;
  }
}

function renderLog() {
  if (!state) return;
  logEl.innerHTML = [...state.log].reverse().slice(0, 10).map((line: string) => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
}

function render() {
  renderBoard();
  renderStatus();
  renderMe();
  renderControls();
  renderMarket();
  renderPlayers();
  renderLog();
}

function showToast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
}

parti.onEvent('game:start', () => showToast('游戏开始！'));
parti.onEvent('game:reset', () => showToast('新一局已创建'));
parti.onState((nextState) => {
  state = nextState;
  render();
});
parti.ready();
