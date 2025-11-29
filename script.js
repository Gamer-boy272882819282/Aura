// Aura — main game script (patched & extended)
// Fixes applied:
// - Robust saving/loading with schema version.
// - Prevent negative purchases and floating NaN values.
// - Added more upgrades, generators, a Lucky Spin, prestige, achievements,
//   visual click feedback and simple particle effect for fun.
// - Auto-save and explicit save button, reset confirmation.
// - Replaced broken image (handled in index.html).

(() => {
  // Game state
  const stateKey = 'aura_game_v1';
  let state = {
    aura: 0,
    totalAura: 0,
    perClick: 1,
    perSec: 0,
    upgrades: {},
    generators: {},
    prestigePoints: 0,
    unlocks: {},
    version: 1
  };

  // DOM
  const auraEl = document.getElementById('aura');
  const perClickEl = document.getElementById('perClick');
  const perSecEl = document.getElementById('perSec');
  const upgradesEl = document.getElementById('upgrades');
  const generatorsEl = document.getElementById('generators');
  const orb = document.getElementById('orb');
  const orbFeedback = document.getElementById('orbFeedback');
  const floatingContainer = document.getElementById('floating-container');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const spinBtn = document.getElementById('spinBtn');
  const prestigeBtn = document.getElementById('prestigeBtn');
  const achievementsEl = document.getElementById('achievements');
  const eventsEl = document.getElementById('events');
  const saveStatusEl = document.getElementById('saveStatus');

  // Utility
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const fmt = n => {
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
    if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
    if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'k';
    return Math.floor(n).toString();
  };

  // Game definitions (added more upgrades & features)
  const UPGRADE_LIST = [
    { id: 'click2', title: 'Sharp Fingers', desc: 'Double aura per click', cost: 25, effect: s => s.perClick *= 2 },
    { id: 'click5', title: 'Aura Channeling', desc: 'Increase click by +5', cost: 150, effect: s => s.perClick += 5 },
    { id: 'mult1', title: 'Minor Multiplier', desc: 'Multiply all income by 1.5', cost: 500, effect: s => { s.perClick *= 1.5; s.perSec *= 1.5; } },
    { id: 'autoBoost', title: 'Auto Tuner', desc: 'Increase generator efficiency by 20%', cost: 2500, effect: s => { /* supported in generator calc */ } },
    { id: 'goldenAura', title: 'Golden Aura', desc: 'Small permanent bonus +10 to per click', cost: 15000, effect: s => s.perClick += 10 }
  ];

  const GENERATOR_LIST = [
    { id: 'g1', title: 'Aura Bubble', baseCost: 10, baseProd: 0.2 },
    { id: 'g2', title: 'Luminous Orb', baseCost: 100, baseProd: 2 },
    { id: 'g3', title: 'Prism Reactor', baseCost: 1000, baseProd: 20 }
  ];

  const ACHIEVEMENTS = [
    { id: 'firstClick', text: 'First Click', check: s => s.totalAura >= 1 },
    { id: 'rich', text: '1,000 Aura', check: s => s.totalAura >= 1000 },
    { id: 'collector', text: 'Buy 10 upgrades', check: s => Object.keys(s.upgrades).length >= 10 }
  ];

  // State helpers
  function saveState() {
    try {
      localStorage.setItem(stateKey, JSON.stringify(state));
      saveStatusEl.textContent = 'Saved at ' + new Date().toLocaleTimeString();
    } catch (e) {
      console.error('Save failed', e);
      saveStatusEl.textContent = 'Auto-save failed';
    }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(stateKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // simple migration guard
      if (parsed && typeof parsed.aura === 'number') {
        state = Object.assign(state, parsed);
      }
    } catch (e) {
      console.error('Load failed', e);
    }
  }
  function resetState() {
    if (!confirm('Reset game? This will clear progress.')) return;
    localStorage.removeItem(stateKey);
    location.reload();
  }

  // Init UI
  function createUpgradeEntry(u) {
    const tpl = document.getElementById('upgrade-template');
    const clone = tpl.content.cloneNode(true);
    const root = clone.querySelector('.entry');
    clone.querySelector('.entry-title').textContent = u.title;
    clone.querySelector('.entry-desc').textContent = u.desc;
    const costEl = clone.querySelector('.entry-cost');
    const buyBtn = clone.querySelector('.buy');

    function update() {
      const owned = state.upgrades[u.id] || 0;
      const cost = Math.max(Math.floor(u.cost * Math.pow(1.15, owned)), 1);
      costEl.textContent = fmt(cost);
      buyBtn.disabled = state.aura < cost;
      buyBtn.textContent = 'Buy';
      if (owned) root.classList.add('owned'); else root.classList.remove('owned');
    }

    buyBtn.addEventListener('click', () => {
      const owned = state.upgrades[u.id] || 0;
      const cost = Math.max(Math.floor(u.cost * Math.pow(1.15, owned)), 1);
      if (state.aura < cost) {
        showEvent('Not enough Aura!');
        return;
      }
      state.aura = Math.max(0, state.aura - cost);
      state.upgrades[u.id] = owned + 1;
      // apply effect -- repeatable upgrades apply multiple times
      try { u.effect(state); } catch(e){ console.error(e); }
      showFloating('−' + fmt(cost), '#ffdd57');
      updateAll();
      showEvent(`${u.title} purchased!`);
    });

    update();
    return { node: root, update };
  }

  function createGeneratorEntry(g) {
    const tpl = document.createElement('div');
    tpl.className = 'entry';
    tpl.innerHTML = `
      <div class="entry-info">
        <div class="entry-title">${g.title}</div>
        <div class="entry-desc">Produces <span class="prod"></span>/s</div>
      </div>
      <div class="entry-buy">
        <div class="entry-cost"></div>
        <button class="buy small">Buy</button>
      </div>
    `;
    const costEl = tpl.querySelector('.entry-cost');
    const buyBtn = tpl.querySelector('.buy');
    const prodEl = tpl.querySelector('.prod');

    function ownedCount() { return state.generators[g.id] || 0; }
    function calcCost(n) { return Math.max(Math.floor(g.baseCost * Math.pow(1.15, n)), 1); }
    function calcProd(n) {
      const base = g.baseProd * n;
      // autoBoost upgrade increases efficiency
      const boost = state.upgrades['autoBoost'] ? 1 + (0.2 * state.upgrades['autoBoost']) : 1;
      return base * boost;
    }

    function update() {
      const n = ownedCount();
      const nextCost = calcCost(n);
      costEl.textContent = fmt(nextCost);
      buyBtn.disabled = state.aura < nextCost;
      prodEl.textContent = fmt(calcProd(n + 1) - calcProd(n));
      tpl.querySelector('.entry-title').textContent = `${g.title} ×${n}`;
    }

    buyBtn.addEventListener('click', () => {
      const n = ownedCount();
      const cost = calcCost(n);
      if (state.aura < cost) {
        showEvent('Not enough Aura!');
        return;
      }
      state.aura = Math.max(0, state.aura - cost);
      state.generators[g.id] = n + 1;
      showFloating('−' + fmt(cost), '#ff7b7b');
      updateAll();
    });

    return { node: tpl, update };
  }

  // Floating feedback
  function showFloating(text, color = '#a0e9ff') {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    floatingContainer.appendChild(el);
    // positioning: center of orb
    const rect = orb.getBoundingClientRect();
    el.style.left = (rect.left + rect.width/2) + 'px';
    el.style.top = (rect.top + 30) + 'px';
    // animate with CSS; remove after duration
    setTimeout(() => el.classList.add('up'), 10);
    setTimeout(() => el.remove(), 1800);
  }

  // Events feed
  function showEvent(text) {
    eventsEl.classList.remove('hidden');
    eventsEl.textContent = text;
    setTimeout(() => eventsEl.classList.add('hidden'), 2500);
  }

  // Achievements update
  function checkAchievements() {
    ACHIEVEMENTS.forEach(a => {
      if (!state.unlocks[a.id] && a.check(state)) {
        state.unlocks[a.id] = true;
        showEvent('Achievement unlocked: ' + a.text);
        const li = document.createElement('li');
        li.textContent = a.text;
        achievementsEl.appendChild(li);
      }
    });
  }

  // UI update
  const upgradeEntries = [];
  const generatorEntries = [];
  function initShop() {
    UPGRADE_LIST.forEach(u => {
      const e = createUpgradeEntry(u);
      upgradesEl.appendChild(e.node);
      upgradeEntries.push(e);
    });
    GENERATOR_LIST.forEach(g => {
      const e = createGeneratorEntry(g);
      generatorsEl.appendChild(e.node);
      generatorEntries.push(e);
    });
  }

  function updateAll() {
    // recalc perSec from generators
    let perSec = 0;
    GENERATOR_LIST.forEach(g => {
      const n = state.generators[g.id] || 0;
      const base = g.baseProd * n;
      const boost = state.upgrades['autoBoost'] ? 1 + (0.2 * state.upgrades['autoBoost']) : 1;
      perSec += base * boost;
    });
    state.perSec = Number((perSec).toFixed(4));
    // clamp numeric corruption
    state.aura = Number(isFinite(state.aura) ? state.aura : 0);
    state.perClick = Number(isFinite(state.perClick) ? state.perClick : 1);

    auraEl.textContent = fmt(state.aura);
    perClickEl.textContent = fmt(state.perClick);
    perSecEl.textContent = fmt(state.perSec);

    upgradeEntries.forEach(u => u.update());
    generatorEntries.forEach(g => g.update());
    checkAchievements();
    // autosave minor throttle
  }

  // Click handling
  function clickOrb() {
    // small random variance for fun
    const variance = 1 + (Math.random() * 0.08 - 0.04);
    const gained = Math.max(0, Math.floor(state.perClick * variance));
    state.aura += gained;
    state.totalAura += gained;
    showFloating('+' + fmt(gained), '#a0e9ff');
    animateOrb();
    updateAll();
  }

  // Orb animation
  function animateOrb() {
    orb.classList.add('click');
    setTimeout(() => orb.classList.remove('click'), 160);
    // small pulse feedback element
    orbFeedback.textContent = '+' + fmt(Math.max(1, Math.floor(state.perClick)));
    orbFeedback.classList.add('visible');
    setTimeout(() => orbFeedback.classList.remove('visible'), 600);
  }

  // Passive income tick
  let lastTick = Date.now();
  function tick() {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    const amount = state.perSec * dt;
    if (amount > 0) {
      state.aura += amount;
      state.totalAura += amount;
      updateAll();
    }
    lastTick = now;
  }
  setInterval(tick, 1000 / 2); // half-second tick for smoother accrual

  // Lucky spin (mini-game)
  function luckySpin() {
    const cost = 50;
    if (state.aura < cost) { showEvent('You need 50 Aura to spin'); return; }
    state.aura -= cost;
    const r = Math.random();
    if (r < 0.5) {
      // small reward
      const reward = Math.floor(25 + Math.random() * 75);
      state.aura += reward;
      showEvent('Spin: +' + reward + ' Aura!');
      showFloating('+' + fmt(reward), '#ffd86b');
    } else if (r < 0.85) {
      // upgrade discount (applies as free tiny bonus)
      state.perClick += 2;
      showEvent('Spin: Click power boosted!');
    } else {
      // big reward
      const reward = Math.floor(200 + Math.random() * 800);
      state.aura += reward;
      showEvent('Jackpot! +' + fmt(reward) + ' Aura!');
      showFloating('+' + fmt(reward), '#ffb3ff');
    }
    updateAll();
  }

  // Prestige (rebirth) simple mechanic: trade aura for prestige points
  function prestige() {
    const minForPrestige = 10000;
    if (state.totalAura < minForPrestige) {
      showEvent('Reach ' + fmt(minForPrestige) + ' total Aura to rebirth.');
      return;
    }
    if (!confirm('Rebirth will reset aura and upgrades but grant prestige points. Proceed?')) return;
    const points = Math.floor(state.totalAura / 10000);
    state.prestigePoints += points;
    // reset core progress
    state.aura = 0;
    state.totalAura = 0;
    state.perClick = 1 + (state.prestigePoints * 0.5); // small scaling with prestige
    state.upgrades = {};
    state.generators = {};
    state.unlocks = {};
    showEvent('You rebirthed and gained ' + points + ' prestige points!');
    updateAll();
  }

  // Auto-save every 10 seconds
  setInterval(() => saveState(), 10000);
  // Save on unload
  window.addEventListener('beforeunload', saveState);

  // Hook DOM events
  orb.addEventListener('click', clickOrb);
  saveBtn.addEventListener('click', saveState);
  resetBtn.addEventListener('click', resetState);
  spinBtn.addEventListener('click', luckySpin);
  prestigeBtn.addEventListener('click', prestige);

  // Basic keyboard shortcuts for fun
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); clickOrb(); }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveState(); showEvent('Saved (ctrl/cmd+s)'); }
  });

  // Start
  (function start() {
    loadState();
    initShop();
    // populate achievements that were already unlocked
    Object.keys(state.unlocks || {}).forEach(k => {
      const li = document.createElement('li');
      const ach = ACHIEVEMENTS.find(a => a.id === k);
      li.textContent = ach ? ach.text : k;
      achievementsEl.appendChild(li);
    });
    updateAll();
    lastTick = Date.now();
    showEvent('Game loaded');
  })();

})();
