const RULES = [
  ['🎯 胜利目标', '默认进行 20 个完整轮次。最终净资产 = 现金 + 地产当前价值 + 股票市值 − 每次破产 3,000。净资产最高者获胜；若有人净资产达到 50,000 且领先第二名至少 15,000，则立即提前获胜。'],
  ['🎲 每回合流程', '轮到你时可先使用适用的策略卡，然后掷 1D6。按点数移动；遇到岔路时由你选择路线。落地后结算地产、税务、机会、银行或其他格子，最后进入经营阶段并结束回合。'],
  ['🏠 地产与拍卖', '落在无人地产时可直接购买。若放弃购买，立即进入公开拍卖，所有仍有资格的玩家都可竞价。地产最高可升级到 Lv4，升级会提高地产价值、租金，并推动对应城区股价。'],
  ['🏙️ 城区组合', '地图分为 6 个城区。同一区持有 1 块地产时租金 ×1；持有至少 2 块时 ×1.5；集齐该城区全部地产时 ×2。'],
  ['📈 区域股票', '每个城区都有独立股价。经过中央银行或指定银行格后可交易股票。地产升级会推高当地股价；一次大量卖出会带来轻微价格压力。股票市值计入最终净资产。'],
  ['🃏 策略卡', '策略卡包括疾行、遥控骰子、免租券、加倍租金、强制交换、市场内幕、施工队、停电、现金返还、银行快线、市场繁荣和税务审计。不同卡牌只能在合法阶段使用。'],
  ['🤝 玩家交易', '经营阶段可向其他玩家发起一次简单交易，用现金、地产或两者组合报价。对方可直接接受或拒绝，避免无限议价拖慢游戏。'],
  ['💥 破产救助', '无法支付债务时会触发资产清算并获得 1 个破产标记。玩家休整 1 回合后，以 5,000 救助金重返游戏。每个破产标记在最终净资产中扣除 3,000。'],
];

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createBackdrop() {
  if (document.querySelector('.city-backdrop')) return;
  const random = seededRandom(20260820);
  const backdrop = document.createElement('div');
  backdrop.className = 'city-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const glow = document.createElement('div');
  glow.className = 'city-glow';
  backdrop.appendChild(glow);

  const roadGrid = document.createElement('div');
  roadGrid.className = 'road-grid';
  backdrop.appendChild(roadGrid);

  const skyline = document.createElement('div');
  skyline.className = 'skyline-layer';
  for (let i = 0; i < 24; i += 1) {
    const building = document.createElement('i');
    building.className = 'skyline-building';
    const width = 2.5 + random() * 4.5;
    const height = 16 + random() * 32;
    building.style.setProperty('--x', `${i * 4.35 - 2}%`);
    building.style.setProperty('--w', `${width}%`);
    building.style.setProperty('--h', `${height}%`);
    building.style.setProperty('--delay', `${-random() * 6}s`);
    skyline.appendChild(building);
  }
  backdrop.appendChild(skyline);

  const lights = document.createElement('div');
  lights.className = 'city-lights';
  for (let i = 0; i < 48; i += 1) {
    const light = document.createElement('i');
    light.style.setProperty('--x', `${random() * 100}%`);
    light.style.setProperty('--y', `${12 + random() * 78}%`);
    light.style.setProperty('--s', `${2 + random() * 5}px`);
    light.style.setProperty('--d', `${2.5 + random() * 5}s`);
    light.style.setProperty('--delay', `${-random() * 6}s`);
    lights.appendChild(light);
  }
  backdrop.appendChild(lights);

  for (let i = 0; i < 7; i += 1) {
    const coin = document.createElement('i');
    coin.className = 'ambient-coin';
    coin.textContent = '¥';
    coin.style.setProperty('--x', `${5 + random() * 90}%`);
    coin.style.setProperty('--y', `${20 + random() * 60}%`);
    coin.style.setProperty('--d', `${5 + random() * 5}s`);
    coin.style.setProperty('--delay', `${-random() * 6}s`);
    backdrop.appendChild(coin);
  }

  document.body.prepend(backdrop);
}

function createRulesManual() {
  if (document.getElementById('rules-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'rules-modal';
  modal.className = 'rules-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="rules-scrim" data-rules-close></div>
    <section class="rules-book" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div class="rules-book-edge"></div>
      <header class="rules-header">
        <div>
          <span class="rules-kicker">CITY TYCOON HANDBOOK</span>
          <h2 id="rules-title">Parti 大富翁 · 游戏规则</h2>
          <p>买地 · 投资 · 股票 · 卡牌 · 交易 · 反败为胜</p>
        </div>
        <button class="icon-btn rules-close" type="button" data-rules-close aria-label="关闭规则">×</button>
      </header>
      <div class="rules-objective">
        <span class="rules-die">⚄</span>
        <div><strong>核心体验</strong><p>掷骰探索城市，用地产与股票共同经营净资产。每次落点都可能改变整座城市的财富版图。</p></div>
      </div>
      <div class="rules-grid">
        ${RULES.map(([title, body], index) => `<article class="rule-card"><span class="rule-number">${String(index + 1).padStart(2, '0')}</span><h3>${title}</h3><p>${body}</p></article>`).join('')}
      </div>
      <footer class="rules-footer"><span>提示：当前可执行操作永远以右侧「行动甲板」为准。</span><button class="action-btn primary" type="button" data-rules-close>回到城市</button></footer>
    </section>`;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.remove('open');
    window.setTimeout(() => { modal.hidden = true; }, 160);
  };
  const open = () => {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
  };
  modal.querySelectorAll<HTMLElement>('[data-rules-close]').forEach((el) => el.addEventListener('click', close));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  const installButton = () => {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('.rules-open')) return false;
    const actions = document.createElement('div');
    actions.className = 'topbar-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rules-open';
    button.innerHTML = '<span>📖</span><b>规则</b>';
    button.addEventListener('click', open);
    const round = topbar.querySelector('.round-pill');
    if (round) actions.append(round);
    actions.append(button);
    topbar.append(actions);
    return true;
  };

  if (!installButton()) {
    const observer = new MutationObserver(() => {
      if (installButton()) observer.disconnect();
    });
    observer.observe(document.getElementById('app')!, { childList: true, subtree: true });
  }
}

function installActionBridge() {
  document.addEventListener('click', (event) => {
    const source = event.target;
    if (!(source instanceof Element)) return;
    const button = source.closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.classList.contains('disabled')) return;

    const actionName = button.dataset.action;
    if (!actionName) return;
    if (actionName === 'start') {
      const current = parti.getState() as any;
      const firstPlayerId = current?.order?.[0] ?? null;
      if (firstPlayerId !== parti.playerId) {
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = '由首位玩家开始游戏，开局后即可直接掷骰子';
          toast.classList.add('show');
          window.setTimeout(() => toast.classList.remove('show'), 2400);
        }
        return;
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(decodeURIComponent(button.dataset.payload || 'null'));
    } catch {
      payload = undefined;
    }
    parti.action(actionName, payload ?? undefined);
  }, true);
}

function installDiceEffects() {
  const attach = () => {
    const dice = document.getElementById('dice');
    if (!dice || dice.dataset.fxReady) return false;
    dice.dataset.fxReady = '1';
    let previous = dice.textContent;
    new MutationObserver(() => {
      if (dice.textContent === previous) return;
      previous = dice.textContent;
      dice.classList.remove('dice-pop');
      void dice.getBoundingClientRect();
      dice.classList.add('dice-pop');
    }).observe(dice, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!attach()) {
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect();
    });
    observer.observe(document.getElementById('app')!, { childList: true, subtree: true });
  }
}

createBackdrop();
createRulesManual();
installActionBridge();
installDiceEffects();
