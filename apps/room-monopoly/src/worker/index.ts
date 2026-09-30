import { defineRoom } from '@parti/worker-sdk';

type Phase = 'lobby' | 'turn' | 'finished';
type TurnStage = 'preRoll' | 'routeChoice' | 'landingDecision' | 'auction' | 'manage';
type TileKind = 'start' | 'property' | 'chance' | 'tax' | 'bank' | 'transit' | 'rest';
type CardKind =
  | 'boost'
  | 'exact'
  | 'rentShield'
  | 'rentDouble'
  | 'swap'
  | 'insider'
  | 'upgrade'
  | 'blackout'
  | 'rebate'
  | 'teleport'
  | 'marketBoom'
  | 'taxAudit';

type DistrictId = 'harbor' | 'oldtown' | 'tech' | 'garden' | 'finance' | 'skyline';

type Tile = {
  id: number;
  name: string;
  kind: TileKind;
  next: number[];
  district?: DistrictId;
  price?: number;
  baseRent?: number;
  upgradeCost?: number;
  tax?: number;
};

type PropertyState = { ownerId: string | null; level: number; blackoutUntilRound: number };
type PlayerState = {
  id: string;
  name: string;
  cash: number;
  position: number;
  properties: number[];
  stocks: Record<DistrictId, number>;
  cards: CardKind[];
  bankruptcies: number;
  restTurns: number;
  rescuePending: boolean;
  rentShield: number;
  doubleRentArmed: boolean;
};

type AuctionState = {
  tileId: number;
  currentBid: number;
  highestBidderId: string | null;
  passed: string[];
};

type TradeState = {
  proposerId: string;
  targetId: string;
  cashGive: number;
  cashReceive: number;
  propertyGive: number | null;
  propertyReceive: number | null;
};

type GameState = {
  phase: Phase;
  stage: TurnStage;
  players: Record<string, PlayerState>;
  order: string[];
  turnIndex: number;
  round: number;
  dice: number | null;
  pendingMove: { remaining: number; choices: number[] } | null;
  pendingPropertyId: number | null;
  auction: AuctionState | null;
  trade: TradeState | null;
  properties: Record<string, PropertyState>;
  stockPrices: Record<DistrictId, number>;
  bankAccess: boolean;
  winnerId: string | null;
  finishReason: string | null;
  log: string[];
};

const DISTRICTS: Record<DistrictId, { name: string; icon: string }> = {
  harbor: { name: '海港区', icon: '⚓' },
  oldtown: { name: '旧城区', icon: '🏮' },
  tech: { name: '科技区', icon: '🤖' },
  garden: { name: '花园区', icon: '🌿' },
  finance: { name: '金融区', icon: '💹' },
  skyline: { name: '天际区', icon: '🌆' },
};

const DISTRICT_IDS = Object.keys(DISTRICTS) as DistrictId[];

const TILES: Tile[] = [
  { id: 0, name: '中央银行', kind: 'start', next: [1] },
  { id: 1, name: '晨曦码头', kind: 'property', district: 'harbor', price: 1800, baseRent: 240, upgradeCost: 900, next: [2] },
  { id: 2, name: '海风鱼市', kind: 'property', district: 'harbor', price: 2000, baseRent: 280, upgradeCost: 1000, next: [3] },
  { id: 3, name: '机会站', kind: 'chance', next: [4] },
  { id: 4, name: '灯塔街', kind: 'property', district: 'harbor', price: 2300, baseRent: 320, upgradeCost: 1100, next: [5] },
  { id: 5, name: '税务局', kind: 'tax', tax: 800, next: [6] },
  { id: 6, name: '老城茶馆', kind: 'property', district: 'oldtown', price: 2400, baseRent: 340, upgradeCost: 1200, next: [7] },
  { id: 7, name: '老城岔口', kind: 'transit', next: [8, 10] },
  { id: 8, name: '戏院街', kind: 'property', district: 'oldtown', price: 2600, baseRent: 380, upgradeCost: 1300, next: [9] },
  { id: 9, name: '牌坊巷', kind: 'property', district: 'oldtown', price: 2900, baseRent: 430, upgradeCost: 1400, next: [12] },
  { id: 10, name: '老城银行', kind: 'bank', next: [11] },
  { id: 11, name: '古玩街', kind: 'property', district: 'oldtown', price: 2800, baseRent: 410, upgradeCost: 1400, next: [12] },
  { id: 12, name: '科技广场', kind: 'property', district: 'tech', price: 3200, baseRent: 480, upgradeCost: 1600, next: [13] },
  { id: 13, name: '数据中心', kind: 'property', district: 'tech', price: 3500, baseRent: 540, upgradeCost: 1700, next: [14] },
  { id: 14, name: '机器人厂', kind: 'property', district: 'tech', price: 3800, baseRent: 620, upgradeCost: 1900, next: [15] },
  { id: 15, name: '机会站', kind: 'chance', next: [16] },
  { id: 16, name: '城市公园', kind: 'rest', next: [17] },
  { id: 17, name: '玫瑰大道', kind: 'property', district: 'garden', price: 3000, baseRent: 450, upgradeCost: 1500, next: [18] },
  { id: 18, name: '温室花房', kind: 'property', district: 'garden', price: 3300, baseRent: 510, upgradeCost: 1600, next: [19] },
  { id: 19, name: '湖畔别墅', kind: 'property', district: 'garden', price: 3600, baseRent: 580, upgradeCost: 1800, next: [20] },
  { id: 20, name: '中央岔口', kind: 'transit', next: [21, 23] },
  { id: 21, name: '证券街', kind: 'property', district: 'finance', price: 4000, baseRent: 680, upgradeCost: 2000, next: [22] },
  { id: 22, name: '金库广场', kind: 'property', district: 'finance', price: 4400, baseRent: 760, upgradeCost: 2200, next: [25] },
  { id: 23, name: '交易银行', kind: 'bank', next: [24] },
  { id: 24, name: '基金大道', kind: 'property', district: 'finance', price: 4200, baseRent: 720, upgradeCost: 2100, next: [25] },
  { id: 25, name: '云端公寓', kind: 'property', district: 'skyline', price: 4600, baseRent: 820, upgradeCost: 2300, next: [26] },
  { id: 26, name: '摩天中心', kind: 'property', district: 'skyline', price: 5000, baseRent: 900, upgradeCost: 2500, next: [27] },
  { id: 27, name: '天空酒店', kind: 'property', district: 'skyline', price: 5400, baseRent: 980, upgradeCost: 2700, next: [28] },
  { id: 28, name: '城市税', kind: 'tax', tax: 1200, next: [29] },
  { id: 29, name: '机会站', kind: 'chance', next: [30] },
  { id: 30, name: '换乘枢纽', kind: 'transit', next: [31] },
  { id: 31, name: '夜市', kind: 'chance', next: [0] },
];

const PROPERTY_IDS = TILES.filter((t) => t.kind === 'property').map((t) => t.id);
const DISTRICT_PROPERTY_IDS = Object.fromEntries(
  DISTRICT_IDS.map((district) => [district, TILES.filter((t) => t.district === district).map((t) => t.id)]),
) as Record<DistrictId, number[]>;

const CARD_LABELS: Record<CardKind, string> = {
  boost: '疾行 +3',
  exact: '遥控骰子',
  rentShield: '免租券',
  rentDouble: '加倍租金',
  swap: '强制交换',
  insider: '市场内幕',
  upgrade: '施工队',
  blackout: '停电',
  rebate: '现金返还',
  teleport: '银行快线',
  marketBoom: '市场繁荣',
  taxAudit: '税务审计',
};

const CARD_POOL: CardKind[] = [
  'boost', 'boost', 'exact', 'rentShield', 'rentShield', 'rentDouble', 'swap', 'insider', 'insider',
  'upgrade', 'blackout', 'rebate', 'rebate', 'teleport', 'marketBoom', 'taxAudit',
];

function emptyStocks(): Record<DistrictId, number> {
  return { harbor: 0, oldtown: 0, tech: 0, garden: 0, finance: 0, skyline: 0 };
}

function drawCard(): CardKind {
  return CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
}

function addLog(state: GameState, message: string) {
  state.log.push(message);
  if (state.log.length > 24) state.log.splice(0, state.log.length - 24);
}

function currentPlayerId(state: GameState) {
  return state.order[state.turnIndex] ?? null;
}

function districtOwnedCount(state: GameState, playerId: string, district: DistrictId) {
  return DISTRICT_PROPERTY_IDS[district].filter((id) => state.properties[String(id)].ownerId === playerId).length;
}

function districtRentMultiplier(state: GameState, playerId: string, district: DistrictId) {
  const owned = districtOwnedCount(state, playerId, district);
  const total = DISTRICT_PROPERTY_IDS[district].length;
  if (owned >= total) return 2;
  if (owned >= 2) return 1.5;
  return 1;
}

function propertyCurrentValue(tile: Tile, prop: PropertyState) {
  return (tile.price ?? 0) + Math.max(0, prop.level - 1) * (tile.upgradeCost ?? 0);
}

function netWorth(state: GameState, playerId: string) {
  const p = state.players[playerId];
  if (!p) return 0;
  const propertyValue = p.properties.reduce((sum, id) => {
    const tile = TILES[id];
    return sum + propertyCurrentValue(tile, state.properties[String(id)]);
  }, 0);
  const stockValue = DISTRICT_IDS.reduce((sum, district) => sum + p.stocks[district] * state.stockPrices[district], 0);
  return p.cash + propertyValue + stockValue - p.bankruptcies * 3000;
}

function leaderboard(state: GameState) {
  return state.order
    .filter((id) => state.players[id])
    .map((id) => ({ id, value: netWorth(state, id) }))
    .sort((a, b) => b.value - a.value);
}

function finishGame(state: GameState, winnerId: string, reason: string) {
  state.phase = 'finished';
  state.winnerId = winnerId;
  state.finishReason = reason;
  state.pendingMove = null;
  state.pendingPropertyId = null;
  state.auction = null;
  state.trade = null;
  addLog(state, `🏆 ${state.players[winnerId]?.name ?? '玩家'} 获胜：${reason}`);
}

function checkEarlyVictory(state: GameState) {
  if (state.phase !== 'turn') return false;
  const board = leaderboard(state);
  if (board.length < 2) return false;
  if (board[0].value >= 50000 && board[0].value - board[1].value >= 15000) {
    finishGame(state, board[0].id, '净资产突破 50,000 且领先第二名至少 15,000');
    return true;
  }
  return false;
}

function bankrupt(state: GameState, playerId: string, creditorId?: string | null) {
  const p = state.players[playerId];
  if (!p) return;
  if (creditorId && state.players[creditorId] && p.cash > 0) state.players[creditorId].cash += p.cash;
  p.cash = 0;
  for (const id of [...p.properties]) {
    state.properties[String(id)] = { ownerId: null, level: 1, blackoutUntilRound: 0 };
  }
  p.properties = [];
  p.stocks = emptyStocks();
  p.cards = [];
  p.bankruptcies += 1;
  p.restTurns = 1;
  p.rescuePending = true;
  p.rentShield = 0;
  p.doubleRentArmed = false;
  addLog(state, `💥 ${p.name} 破产清算，休整 1 回合后获得 5,000 救助金`);
}

function charge(state: GameState, payerId: string, amount: number, receiverId?: string | null) {
  const payer = state.players[payerId];
  if (!payer || amount <= 0) return true;
  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (receiverId && state.players[receiverId]) state.players[receiverId].cash += amount;
    return true;
  }
  bankrupt(state, payerId, receiverId);
  return false;
}

function maybePassStart(state: GameState, from: number, to: number, playerId: string) {
  if (from === 31 && to === 0) {
    const p = state.players[playerId];
    p.cash += 1500;
    state.bankAccess = true;
    addLog(state, `🏦 ${p.name} 经过中央银行，获得 1,500 并解锁本回合股票交易`);
  }
}

function finishMovement(state: GameState, playerId: string) {
  state.pendingMove = null;
  const player = state.players[playerId];
  const tile = TILES[player.position];
  if (tile.kind === 'property') {
    const prop = state.properties[String(tile.id)];
    if (!prop.ownerId) {
      state.pendingPropertyId = tile.id;
      state.stage = 'landingDecision';
      addLog(state, `🏠 ${player.name} 到达无人地产「${tile.name}」`);
      return;
    }
    if (prop.ownerId === playerId) {
      state.stage = 'manage';
      addLog(state, `🔑 ${player.name} 回到自己的「${tile.name}」`);
      return;
    }
    if (prop.blackoutUntilRound >= state.round) {
      state.stage = 'manage';
      addLog(state, `🌑 「${tile.name}」停电中，本次免租`);
      return;
    }
    const owner = state.players[prop.ownerId];
    const multiplier = districtRentMultiplier(state, owner.id, tile.district!);
    let rent = Math.round((tile.baseRent ?? 0) * prop.level * multiplier);
    if (owner.doubleRentArmed) {
      rent *= 2;
      owner.doubleRentArmed = false;
    }
    if (player.rentShield > 0) {
      player.rentShield -= 1;
      addLog(state, `🛡️ ${player.name} 使用免租券，抵消「${tile.name}」租金 ${rent}`);
      state.stage = 'manage';
      return;
    }
    const paid = charge(state, playerId, rent, owner.id);
    addLog(state, paid ? `💸 ${player.name} 向 ${owner.name} 支付租金 ${rent}` : `💸 ${player.name} 无法支付租金 ${rent}`);
    state.stage = 'manage';
    return;
  }
  if (tile.kind === 'tax') {
    const amount = tile.tax ?? 0;
    const paid = charge(state, playerId, amount);
    addLog(state, paid ? `🧾 ${player.name} 缴税 ${amount}` : `🧾 ${player.name} 因税款触发破产`);
  } else if (tile.kind === 'chance') {
    resolveChance(state, playerId);
  } else if (tile.kind === 'bank' || tile.kind === 'start') {
    state.bankAccess = true;
    addLog(state, `💹 ${player.name} 到达银行，本回合可以交易股票`);
  } else if (tile.kind === 'rest') {
    player.cash += 500;
    addLog(state, `🌿 ${player.name} 在城市公园休息，获得 500 城市福利`);
  }
  state.stage = 'manage';
}

function continueMove(state: GameState, playerId: string, forcedNext?: number) {
  const move = state.pendingMove;
  if (!move) return;
  while (move.remaining > 0) {
    const player = state.players[playerId];
    const tile = TILES[player.position];
    const choices = tile.next;
    let next: number;
    if (forcedNext !== undefined) {
      if (!choices.includes(forcedNext)) return;
      next = forcedNext;
      forcedNext = undefined;
    } else if (choices.length > 1) {
      move.choices = [...choices];
      state.stage = 'routeChoice';
      return;
    } else {
      next = choices[0];
    }
    maybePassStart(state, player.position, next, playerId);
    player.position = next;
    move.remaining -= 1;
  }
  finishMovement(state, playerId);
}

function resolveChance(state: GameState, playerId: string) {
  const p = state.players[playerId];
  const roll = Math.floor(Math.random() * 6);
  if (roll === 0) {
    p.cash += 1200;
    addLog(state, `🎁 ${p.name} 获得城市分红 1,200`);
  } else if (roll === 1) {
    charge(state, playerId, 700);
    addLog(state, `🚧 ${p.name} 遇到道路维修，支付 700`);
  } else if (roll === 2) {
    const card = drawCard();
    p.cards.push(card);
    addLog(state, `🃏 ${p.name} 抽到策略卡「${CARD_LABELS[card]}」`);
  } else if (roll === 3) {
    const district = DISTRICT_IDS[Math.floor(Math.random() * DISTRICT_IDS.length)];
    p.stocks[district] += 3;
    addLog(state, `📈 ${p.name} 获得 ${DISTRICTS[district].name} 股票 3 股`);
  } else if (roll === 4) {
    p.cash += 600;
    const card = drawCard();
    p.cards.push(card);
    addLog(state, `✨ ${p.name} 获得 600 与策略卡「${CARD_LABELS[card]}」`);
  } else {
    const richest = leaderboard(state)[0];
    if (richest && richest.id === playerId) {
      charge(state, playerId, 1000);
      addLog(state, `👑 ${p.name} 作为当前首富支付 1,000 城市公益金`);
    } else {
      p.cash += 800;
      addLog(state, `🤝 ${p.name} 获得追赶补助 800`);
    }
  }
}

function startAuction(state: GameState, tileId: number) {
  state.auction = { tileId, currentBid: 0, highestBidderId: null, passed: [] };
  state.stage = 'auction';
  addLog(state, `🔨 「${TILES[tileId].name}」进入公开拍卖`);
}

function settleAuction(state: GameState) {
  const auction = state.auction;
  if (!auction) return;
  const tile = TILES[auction.tileId];
  if (auction.highestBidderId) {
    const winner = state.players[auction.highestBidderId];
    if (winner && winner.cash >= auction.currentBid) {
      winner.cash -= auction.currentBid;
      winner.properties.push(tile.id);
      state.properties[String(tile.id)].ownerId = winner.id;
      addLog(state, `🔨 ${winner.name} 以 ${auction.currentBid} 拍得「${tile.name}」`);
    }
  } else {
    addLog(state, `🔨 「${tile.name}」流拍`);
  }
  state.auction = null;
  state.pendingPropertyId = null;
  state.stage = 'manage';
}

function maybeSettleAuction(state: GameState) {
  const auction = state.auction;
  if (!auction) return;
  const eligible = state.order.filter((id) => state.players[id] && state.players[id].restTurns === 0);
  if (!auction.highestBidderId) {
    if (auction.passed.length >= eligible.length) settleAuction(state);
    return;
  }
  const others = eligible.filter((id) => id !== auction.highestBidderId);
  if (others.every((id) => auction.passed.includes(id))) settleAuction(state);
}

function advanceTurn(state: GameState) {
  if (state.phase !== 'turn') return;
  state.trade = null;
  state.auction = null;
  state.pendingMove = null;
  state.pendingPropertyId = null;
  state.dice = null;
  state.bankAccess = false;

  let checked = 0;
  while (checked < Math.max(1, state.order.length * 2)) {
    state.turnIndex += 1;
    if (state.turnIndex >= state.order.length) {
      state.turnIndex = 0;
      state.round += 1;
      if (state.round > 20) {
        const board = leaderboard(state);
        if (board[0]) finishGame(state, board[0].id, '20 轮结束，净资产最高');
        return;
      }
    }
    const id = currentPlayerId(state);
    const p = id ? state.players[id] : null;
    checked += 1;
    if (!p) continue;
    if (p.restTurns > 0) {
      p.restTurns -= 1;
      addLog(state, `⏸️ ${p.name} 本轮休整，跳过回合`);
      if (p.restTurns === 0 && p.rescuePending) {
        p.cash += 5000;
        p.rescuePending = false;
        addLog(state, `🛟 ${p.name} 获得 5,000 救助金，下一轮重返市场`);
      }
      continue;
    }
    state.stage = 'preRoll';
    addLog(state, `🎯 第 ${state.round} 轮 · 轮到 ${p.name}`);
    return;
  }
}

function consumeCard(p: PlayerState, kind: CardKind) {
  const index = p.cards.indexOf(kind);
  if (index < 0) return false;
  p.cards.splice(index, 1);
  return true;
}

function makeInitialState(): GameState {
  const properties: Record<string, PropertyState> = {};
  PROPERTY_IDS.forEach((id) => {
    properties[String(id)] = { ownerId: null, level: 1, blackoutUntilRound: 0 };
  });
  return {
    phase: 'lobby',
    stage: 'preRoll',
    players: {},
    order: [],
    turnIndex: 0,
    round: 1,
    dice: null,
    pendingMove: null,
    pendingPropertyId: null,
    auction: null,
    trade: null,
    properties,
    stockPrices: { harbor: 100, oldtown: 100, tech: 100, garden: 100, finance: 100, skyline: 100 },
    bankAccess: false,
    winnerId: null,
    finishReason: null,
    log: ['欢迎来到 Parti 大富翁。2–6 人即可开始。'],
  };
}

function publicConfig() {
  return { tiles: TILES, districts: DISTRICTS, districtPropertyIds: DISTRICT_PROPERTY_IDS, cardLabels: CARD_LABELS };
}

export default defineRoom({
  meta: { name: 'Parti 大富翁', minPlayers: 2, maxPlayers: 6 },

  initialState() {
    return { ...makeInitialState(), config: publicConfig() };
  },

  onJoin(ctx: any, player: { id: string; name: string }) {
    const state = ctx.state as GameState & { config: ReturnType<typeof publicConfig> };
    if (state.players[player.id]) return;
    state.players[player.id] = {
      id: player.id,
      name: player.name || `玩家${state.order.length + 1}`,
      cash: 15000,
      position: 0,
      properties: [],
      stocks: emptyStocks(),
      cards: [drawCard(), drawCard()],
      bankruptcies: 0,
      restTurns: 0,
      rescuePending: false,
      rentShield: 0,
      doubleRentArmed: false,
    };
    state.order.push(player.id);
    addLog(state, `👋 ${state.players[player.id].name} 加入房间`);
  },

  onLeave(ctx: any, player: { id: string }) {
    const state = ctx.state as GameState;
    if (!state.players[player.id]) return;
    const name = state.players[player.id].name;
    const leavingIndex = state.order.indexOf(player.id);
    delete state.players[player.id];
    state.order = state.order.filter((id) => id !== player.id);
    PROPERTY_IDS.forEach((id) => {
      if (state.properties[String(id)].ownerId === player.id) state.properties[String(id)] = { ownerId: null, level: 1, blackoutUntilRound: 0 };
    });
    if (state.trade && (state.trade.proposerId === player.id || state.trade.targetId === player.id)) state.trade = null;
    if (state.auction) {
      if (state.auction.highestBidderId === player.id) {
        state.auction.highestBidderId = null;
        state.auction.currentBid = 0;
      }
      state.auction.passed = state.auction.passed.filter((id) => id !== player.id);
      maybeSettleAuction(state);
    }
    if (leavingIndex >= 0 && leavingIndex < state.turnIndex) state.turnIndex -= 1;
    if (state.turnIndex >= state.order.length) state.turnIndex = 0;
    addLog(state, `👋 ${name} 离开房间`);
    if (state.phase === 'turn' && state.order.length < 2) {
      state.phase = 'lobby';
      state.stage = 'preRoll';
      addLog(state, '等待至少 2 名玩家继续游戏');
    }
  },

  actions: {
    start(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'lobby' || !state.players[player.id] || state.order.length < 2) return;
      state.phase = 'turn';
      state.round = 1;
      state.turnIndex = 0;
      state.stage = 'preRoll';
      addLog(state, `🚀 ${state.players[player.id].name} 开始游戏`);
      addLog(state, `🎯 第 1 轮 · 轮到 ${state.players[currentPlayerId(state)!].name}`);
      ctx.broadcast?.('game:start', {});
    },

    roll(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'preRoll' || currentPlayerId(state) !== player.id) return;
      const die = 1 + Math.floor(Math.random() * 6);
      state.dice = die;
      state.pendingMove = { remaining: die, choices: [] };
      addLog(state, `🎲 ${state.players[player.id].name} 掷出 ${die}`);
      continueMove(state, player.id);
    },

    chooseRoute(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'routeChoice' || currentPlayerId(state) !== player.id || !state.pendingMove) return;
      const target = Number(payload?.target);
      if (!state.pendingMove.choices.includes(target)) return;
      state.pendingMove.choices = [];
      continueMove(state, player.id, target);
    },

    buyProperty(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      if (state.stage !== 'landingDecision' || currentPlayerId(state) !== player.id || state.pendingPropertyId == null) return;
      const tile = TILES[state.pendingPropertyId];
      const prop = state.properties[String(tile.id)];
      if (prop.ownerId || state.players[player.id].cash < (tile.price ?? 0)) return;
      state.players[player.id].cash -= tile.price ?? 0;
      state.players[player.id].properties.push(tile.id);
      prop.ownerId = player.id;
      addLog(state, `🏠 ${state.players[player.id].name} 以 ${tile.price} 买下「${tile.name}」`);
      state.pendingPropertyId = null;
      state.stage = 'manage';
      checkEarlyVictory(state);
    },

    declineProperty(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      if (state.stage !== 'landingDecision' || currentPlayerId(state) !== player.id || state.pendingPropertyId == null) return;
      startAuction(state, state.pendingPropertyId);
    },

    auctionBid(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      const auction = state.auction;
      if (state.stage !== 'auction' || !auction || !state.players[player.id] || auction.passed.includes(player.id)) return;
      const amount = Number(payload?.amount);
      const minBid = auction.currentBid === 0 ? 100 : auction.currentBid + 100;
      if (!Number.isInteger(amount) || amount < minBid || amount > state.players[player.id].cash) return;
      auction.currentBid = amount;
      auction.highestBidderId = player.id;
      addLog(state, `🔨 ${state.players[player.id].name} 出价 ${amount}`);
      maybeSettleAuction(state);
    },

    auctionPass(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      const auction = state.auction;
      if (state.stage !== 'auction' || !auction || !state.players[player.id] || auction.highestBidderId === player.id) return;
      if (!auction.passed.includes(player.id)) auction.passed.push(player.id);
      addLog(state, `🔨 ${state.players[player.id].name} 放弃本轮拍卖`);
      maybeSettleAuction(state);
    },

    upgrade(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'manage' || currentPlayerId(state) !== player.id) return;
      const tileId = Number(payload?.tileId);
      const tile = TILES[tileId];
      const prop = state.properties[String(tileId)];
      if (!tile || tile.kind !== 'property' || !prop || prop.ownerId !== player.id || prop.level >= 4) return;
      const cost = tile.upgradeCost ?? 0;
      if (state.players[player.id].cash < cost) return;
      state.players[player.id].cash -= cost;
      prop.level += 1;
      state.stockPrices[tile.district!] += 15;
      addLog(state, `🏗️ ${state.players[player.id].name} 将「${tile.name}」升级到 Lv${prop.level}，${DISTRICTS[tile.district!].name} 股价 +15`);
      checkEarlyVictory(state);
    },

    stockBuy(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'manage' || currentPlayerId(state) !== player.id || !state.bankAccess) return;
      const district = payload?.district as DistrictId;
      const qty = Number(payload?.qty);
      if (!DISTRICT_IDS.includes(district) || !Number.isInteger(qty) || qty <= 0 || qty > 50) return;
      const cost = qty * state.stockPrices[district];
      if (state.players[player.id].cash < cost) return;
      state.players[player.id].cash -= cost;
      state.players[player.id].stocks[district] += qty;
      addLog(state, `📈 ${state.players[player.id].name} 买入 ${DISTRICTS[district].name} ${qty} 股，花费 ${cost}`);
    },

    stockSell(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'manage' || currentPlayerId(state) !== player.id || !state.bankAccess) return;
      const district = payload?.district as DistrictId;
      const qty = Number(payload?.qty);
      if (!DISTRICT_IDS.includes(district) || !Number.isInteger(qty) || qty <= 0 || state.players[player.id].stocks[district] < qty) return;
      const proceeds = qty * state.stockPrices[district];
      state.players[player.id].stocks[district] -= qty;
      state.players[player.id].cash += proceeds;
      const pressure = Math.floor(qty / 10) * 2;
      state.stockPrices[district] = Math.max(40, state.stockPrices[district] - pressure);
      addLog(state, `📉 ${state.players[player.id].name} 卖出 ${DISTRICTS[district].name} ${qty} 股，获得 ${proceeds}${pressure ? `，股价 -${pressure}` : ''}`);
      checkEarlyVictory(state);
    },

    useCard(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || currentPlayerId(state) !== player.id) return;
      const p = state.players[player.id];
      const kind = payload?.kind as CardKind;
      if (!p.cards.includes(kind)) return;

      if (kind === 'boost') {
        if (state.stage !== 'preRoll') return;
        consumeCard(p, kind);
        const die = 1 + Math.floor(Math.random() * 6) + 3;
        state.dice = die;
        state.pendingMove = { remaining: die, choices: [] };
        addLog(state, `⚡ ${p.name} 使用疾行，移动 ${die} 步`);
        continueMove(state, player.id);
      } else if (kind === 'exact') {
        if (state.stage !== 'preRoll') return;
        const value = Number(payload?.value);
        if (!Number.isInteger(value) || value < 1 || value > 6) return;
        consumeCard(p, kind);
        state.dice = value;
        state.pendingMove = { remaining: value, choices: [] };
        addLog(state, `🎛️ ${p.name} 使用遥控骰子，选择 ${value}`);
        continueMove(state, player.id);
      } else if (kind === 'rentShield') {
        if (state.stage !== 'preRoll' && state.stage !== 'manage') return;
        consumeCard(p, kind);
        p.rentShield += 1;
        addLog(state, `🛡️ ${p.name} 准备了一张免租券`);
      } else if (kind === 'rentDouble') {
        if (state.stage !== 'preRoll' && state.stage !== 'manage') return;
        consumeCard(p, kind);
        p.doubleRentArmed = true;
        addLog(state, `💰 ${p.name} 的下一笔租金将翻倍`);
      } else if (kind === 'rebate') {
        if (state.stage !== 'preRoll' && state.stage !== 'manage') return;
        consumeCard(p, kind);
        p.cash += 1200;
        addLog(state, `💵 ${p.name} 使用现金返还，获得 1,200`);
      } else if (kind === 'teleport') {
        if (state.stage !== 'preRoll') return;
        consumeCard(p, kind);
        const bankIds = [0, 10, 23];
        const target = bankIds.find((id) => id > p.position) ?? 0;
        if (target === 0 && p.position !== 0) {
          p.cash += 1500;
          addLog(state, `🏦 ${p.name} 乘银行快线经过起点，获得 1,500`);
        }
        p.position = target;
        state.bankAccess = true;
        state.stage = 'manage';
        addLog(state, `🚇 ${p.name} 使用银行快线到达「${TILES[target].name}」`);
      } else if (kind === 'insider') {
        if (state.stage !== 'manage') return;
        const district = payload?.district as DistrictId;
        if (!DISTRICT_IDS.includes(district)) return;
        consumeCard(p, kind);
        p.stocks[district] += 5;
        addLog(state, `📰 ${p.name} 通过市场内幕获得 ${DISTRICTS[district].name} 5 股`);
      } else if (kind === 'marketBoom') {
        if (state.stage !== 'manage') return;
        const district = payload?.district as DistrictId;
        if (!DISTRICT_IDS.includes(district)) return;
        consumeCard(p, kind);
        state.stockPrices[district] = Math.round(state.stockPrices[district] * 1.1);
        addLog(state, `🚀 ${p.name} 引爆 ${DISTRICTS[district].name} 市场繁荣，股价上涨 10%`);
      } else if (kind === 'upgrade') {
        if (state.stage !== 'manage') return;
        const tileId = Number(payload?.tileId);
        const tile = TILES[tileId];
        const prop = state.properties[String(tileId)];
        if (!tile || tile.kind !== 'property' || !prop || prop.ownerId !== player.id || prop.level >= 4) return;
        consumeCard(p, kind);
        prop.level += 1;
        state.stockPrices[tile.district!] += 15;
        addLog(state, `👷 ${p.name} 使用施工队免费升级「${tile.name}」到 Lv${prop.level}`);
      } else if (kind === 'blackout') {
        if (state.stage !== 'manage') return;
        const tileId = Number(payload?.tileId);
        const prop = state.properties[String(tileId)];
        if (!prop || !prop.ownerId || prop.ownerId === player.id) return;
        consumeCard(p, kind);
        prop.blackoutUntilRound = state.round + 1;
        addLog(state, `🌑 ${p.name} 让「${TILES[tileId].name}」停电至第 ${state.round + 1} 轮结束`);
      } else if (kind === 'taxAudit') {
        if (state.stage !== 'manage') return;
        const targetId = String(payload?.targetId ?? '');
        if (!state.players[targetId] || targetId === player.id) return;
        consumeCard(p, kind);
        charge(state, targetId, 800);
        addLog(state, `🧾 ${p.name} 对 ${state.players[targetId].name} 发起税务审计，收走 800`);
      } else if (kind === 'swap') {
        if (state.stage !== 'manage') return;
        const targetId = String(payload?.targetId ?? '');
        const giveId = Number(payload?.giveTileId);
        const receiveId = Number(payload?.receiveTileId);
        const give = state.properties[String(giveId)];
        const receive = state.properties[String(receiveId)];
        if (!state.players[targetId] || targetId === player.id || !give || !receive || give.ownerId !== player.id || receive.ownerId !== targetId) return;
        if (give.level !== receive.level) return;
        consumeCard(p, kind);
        give.ownerId = targetId;
        receive.ownerId = player.id;
        p.properties = p.properties.filter((id) => id !== giveId).concat(receiveId);
        const target = state.players[targetId];
        target.properties = target.properties.filter((id) => id !== receiveId).concat(giveId);
        addLog(state, `🔄 ${p.name} 使用强制交换，与 ${target.name} 交换同等级地产`);
      }
      checkEarlyVictory(state);
    },

    proposeTrade(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'manage' || currentPlayerId(state) !== player.id || state.trade) return;
      const targetId = String(payload?.targetId ?? '');
      if (!state.players[targetId] || targetId === player.id) return;
      const cashGive = Math.max(0, Math.floor(Number(payload?.cashGive) || 0));
      const cashReceive = Math.max(0, Math.floor(Number(payload?.cashReceive) || 0));
      const propertyGive = payload?.propertyGive == null ? null : Number(payload.propertyGive);
      const propertyReceive = payload?.propertyReceive == null ? null : Number(payload.propertyReceive);
      if (cashGive > state.players[player.id].cash || cashReceive > state.players[targetId].cash) return;
      if (propertyGive != null && state.properties[String(propertyGive)]?.ownerId !== player.id) return;
      if (propertyReceive != null && state.properties[String(propertyReceive)]?.ownerId !== targetId) return;
      if (cashGive === 0 && cashReceive === 0 && propertyGive == null && propertyReceive == null) return;
      state.trade = { proposerId: player.id, targetId, cashGive, cashReceive, propertyGive, propertyReceive };
      addLog(state, `🤝 ${state.players[player.id].name} 向 ${state.players[targetId].name} 发起交易`);
    },

    respondTrade(ctx: any, { player, payload }: any) {
      const state = ctx.state as GameState;
      const trade = state.trade;
      if (!trade || trade.targetId !== player.id) return;
      const accept = Boolean(payload?.accept);
      if (!accept) {
        addLog(state, `❌ ${state.players[player.id].name} 拒绝交易`);
        state.trade = null;
        return;
      }
      const proposer = state.players[trade.proposerId];
      const target = state.players[trade.targetId];
      if (!proposer || !target || proposer.cash < trade.cashGive || target.cash < trade.cashReceive) {
        state.trade = null;
        return;
      }
      if (trade.propertyGive != null && state.properties[String(trade.propertyGive)]?.ownerId !== proposer.id) { state.trade = null; return; }
      if (trade.propertyReceive != null && state.properties[String(trade.propertyReceive)]?.ownerId !== target.id) { state.trade = null; return; }
      proposer.cash += trade.cashReceive - trade.cashGive;
      target.cash += trade.cashGive - trade.cashReceive;
      if (trade.propertyGive != null) {
        state.properties[String(trade.propertyGive)].ownerId = target.id;
        proposer.properties = proposer.properties.filter((id) => id !== trade.propertyGive);
        target.properties.push(trade.propertyGive);
      }
      if (trade.propertyReceive != null) {
        state.properties[String(trade.propertyReceive)].ownerId = proposer.id;
        target.properties = target.properties.filter((id) => id !== trade.propertyReceive);
        proposer.properties.push(trade.propertyReceive);
      }
      addLog(state, `✅ ${proposer.name} 与 ${target.name} 完成交易`);
      state.trade = null;
      checkEarlyVictory(state);
    },

    endTurn(ctx: any, { player }: any) {
      const state = ctx.state as GameState;
      if (state.phase !== 'turn' || state.stage !== 'manage' || currentPlayerId(state) !== player.id || state.trade) return;
      if (checkEarlyVictory(state)) return;
      advanceTurn(state);
    },

    restart(ctx: any, { player }: any) {
      const old = ctx.state as GameState;
      if (old.phase !== 'finished' || !old.players[player.id]) return;
      const names = old.order.map((id) => ({ id, name: old.players[id]?.name })).filter((x) => x.name);
      const fresh = makeInitialState() as GameState & { config?: ReturnType<typeof publicConfig> };
      fresh.config = publicConfig();
      for (const { id, name } of names) {
        fresh.players[id] = {
          id, name: name!, cash: 15000, position: 0, properties: [], stocks: emptyStocks(), cards: [drawCard(), drawCard()],
          bankruptcies: 0, restTurns: 0, rescuePending: false, rentShield: 0, doubleRentArmed: false,
        };
        fresh.order.push(id);
      }
      Object.keys(ctx.state).forEach((key) => delete ctx.state[key]);
      Object.assign(ctx.state, fresh);
      addLog(ctx.state, `🔁 ${fresh.players[player.id].name} 发起新一局`);
      ctx.broadcast?.('game:reset', {});
    },
  },
});
