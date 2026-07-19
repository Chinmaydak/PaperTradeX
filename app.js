(() => {
  'use strict';

  /* ---------------- Config ---------------- */
  const STARTING_CASH = 10000;
  const TICK_MS = 2000;
  const HISTORY_LEN = 60;
  const STORAGE_KEY = 'papertrade_state_v1';

  const STOCKS = [
    { symbol: 'NOVA', name: 'Nova Robotics',      base: 214.30, vol: 0.006 },
    { symbol: 'HELX', name: 'Helix Genomics',      base: 88.10,  vol: 0.010 },
    { symbol: 'QNTM', name: 'Quantum Foundry',     base: 342.75, vol: 0.012 },
    { symbol: 'BRNZ', name: 'Bronson Retail',      base: 41.55,  vol: 0.004 },
    { symbol: 'AERO', name: 'Aerowave Systems',    base: 129.90, vol: 0.007 },
    { symbol: 'SOLR', name: 'Solara Energy',       base: 67.20,  vol: 0.009 },
    { symbol: 'CDRA', name: 'Cedar Financial',     base: 156.40, vol: 0.005 },
    { symbol: 'PXLN', name: 'Pixelon Interactive', base: 52.80,  vol: 0.014 }
  ];

  /* ---------------- Price engine ---------------- */
  // Deterministic-ish random walk per symbol, kept purely client-side.
  const market = {};
  STOCKS.forEach(s => {
    market[s.symbol] = {
      price: s.base,
      prevClose: s.base,
      history: Array(HISTORY_LEN).fill(s.base),
      vol: s.vol
    };
  });

  function stepMarket() {
    STOCKS.forEach(s => {
      const m = market[s.symbol];
      const drift = (Math.random() - 0.5) * 2 * m.vol;
      let next = m.price * (1 + drift);
      next = Math.max(next, s.base * 0.2); // floor so prices can't collapse to 0
      m.price = Math.round(next * 100) / 100;
      m.history.push(m.price);
      if (m.history.length > HISTORY_LEN) m.history.shift();
    });
  }

  function dayChange(symbol) {
    const m = market[symbol];
    const change = m.price - m.prevClose;
    const pct = (change / m.prevClose) * 100;
    return { change, pct };
  }

  /* ---------------- State ---------------- */
  let state = loadState();

  function defaultState() {
    return {
      cash: STARTING_CASH,
      holdings: {},   // symbol -> { qty, avgCost }
      watchlist: [],  // symbols
      transactions: [] // { time, side, symbol, qty, price, total }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* ---------------- DOM refs ---------------- */
  const el = {
    tickerTrack: document.getElementById('tickerTrack'),
    tickerTrackDup: document.getElementById('tickerTrackDup'),
    cashValue: document.getElementById('cashValue'),
    holdingsValue: document.getElementById('holdingsValue'),
    netWorthValue: document.getElementById('netWorthValue'),
    totalPL: document.getElementById('totalPL'),
    resetBtn: document.getElementById('resetBtn'),
    stockSelect: document.getElementById('stockSelect'),
    quotePrice: document.getElementById('quotePrice'),
    quoteChange: document.getElementById('quoteChange'),
    watchToggle: document.getElementById('watchToggle'),
    sparkline: document.getElementById('sparkline'),
    tradeForm: document.getElementById('tradeForm'),
    qtyInput: document.getElementById('qtyInput'),
    estCost: document.getElementById('estCost'),
    buyBtn: document.getElementById('buyBtn'),
    sellBtn: document.getElementById('sellBtn'),
    tradeMsg: document.getElementById('tradeMsg'),
    holdingsBody: document.getElementById('holdingsBody'),
    holdingsEmpty: document.getElementById('holdingsEmpty'),
    watchlistBody: document.getElementById('watchlistBody'),
    watchlistEmpty: document.getElementById('watchlistEmpty'),
    historyBody: document.getElementById('historyBody'),
    historyEmpty: document.getElementById('historyEmpty'),
    tabBtns: Array.from(document.querySelectorAll('.tab-btn')),
    tabContents: Array.from(document.querySelectorAll('.tab-content'))
  };

  let selectedSymbol = STOCKS[0].symbol;

  /* ---------------- Formatting ---------------- */
  const fmtMoney = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtSigned = n => `${n >= 0 ? '+' : ''}${fmtMoney(n)}`;

  /* ---------------- Rendering ---------------- */
  function renderTicker() {
    const build = () => STOCKS.map(s => {
      const { change, pct } = dayChange(s.symbol);
      const dir = change >= 0 ? 'up' : 'down';
      const arrow = change >= 0 ? '▲' : '▼';
      return `<span class="ticker-item"><span class="sym">${s.symbol}</span>${fmtMoney(market[s.symbol].price)} <span class="${dir}">${arrow} ${Math.abs(pct).toFixed(2)}%</span></span>`;
    }).join('');
    const html = build();
    el.tickerTrack.innerHTML = html;
    el.tickerTrackDup.innerHTML = html;
  }

  function portfolioValue() {
    return Object.entries(state.holdings).reduce((sum, [sym, h]) => {
      const price = market[sym] ? market[sym].price : h.avgCost;
      return sum + price * h.qty;
    }, 0);
  }

  function costBasisTotal() {
    return Object.values(state.holdings).reduce((sum, h) => sum + h.avgCost * h.qty, 0);
  }

  function renderSummary() {
    const holdingsVal = portfolioValue();
    const netWorth = state.cash + holdingsVal;
    const unrealizedPL = holdingsVal - costBasisTotal();

    el.cashValue.textContent = fmtMoney(state.cash);
    el.holdingsValue.textContent = fmtMoney(holdingsVal);
    el.netWorthValue.textContent = fmtMoney(netWorth);
    el.totalPL.textContent = fmtSigned(netWorth - STARTING_CASH);
    el.totalPL.style.color = (netWorth - STARTING_CASH) >= 0 ? 'var(--up)' : 'var(--down)';
  }

  function renderStockSelect() {
    if (el.stockSelect.options.length) return; // build once
    el.stockSelect.innerHTML = STOCKS.map(s =>
      `<option value="${s.symbol}">${s.symbol} — ${s.name}</option>`
    ).join('');
    el.stockSelect.value = selectedSymbol;
  }

  function renderQuote() {
    const m = market[selectedSymbol];
    const { change, pct } = dayChange(selectedSymbol);
    el.quotePrice.textContent = fmtMoney(m.price);
    el.quoteChange.textContent = `${fmtSigned(change)} (${pct.toFixed(2)}%)`;
    el.quoteChange.className = `quote-change ${change >= 0 ? 'up' : 'down'}`;
    el.watchToggle.classList.toggle('active', state.watchlist.includes(selectedSymbol));
    el.watchToggle.textContent = state.watchlist.includes(selectedSymbol) ? '★ Watching' : '☆ Watch';
    updateEstCost();
  }

  function drawSparkline() {
    const canvas = el.sparkline;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight || 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const history = market[selectedSymbol].history;
    const min = Math.min(...history), max = Math.max(...history);
    const pad = 8;
    const range = (max - min) || 1;

    const points = history.map((p, i) => {
      const x = pad + (i / (history.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p - min) / range) * (h - pad * 2);
      return [x, y];
    });

    const rising = history[history.length - 1] >= history[0];
    ctx.strokeStyle = rising ? '#21c972' : '#f5486b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.stroke();

    // soft fill under the line
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rising ? 'rgba(33,201,114,0.18)' : 'rgba(245,72,107,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.lineTo(points[points.length - 1][0], h - pad);
    ctx.lineTo(points[0][0], h - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function updateEstCost() {
    const qty = Math.max(0, parseInt(el.qtyInput.value, 10) || 0);
    const price = market[selectedSymbol].price;
    el.estCost.textContent = fmtMoney(qty * price);
  }

  function renderHoldings() {
    const rows = Object.entries(state.holdings).filter(([, h]) => h.qty > 0);
    el.holdingsEmpty.style.display = rows.length ? 'none' : 'block';
    el.holdingsBody.innerHTML = rows.map(([sym, h]) => {
      const price = market[sym] ? market[sym].price : h.avgCost;
      const value = price * h.qty;
      const pl = value - h.avgCost * h.qty;
      const plCls = pl >= 0 ? 'up' : 'down';
      return `<tr>
        <td>${sym}</td>
        <td>${h.qty}</td>
        <td>${fmtMoney(h.avgCost)}</td>
        <td>${fmtMoney(price)}</td>
        <td>${fmtMoney(value)}</td>
        <td class="${plCls}">${fmtSigned(pl)}</td>
      </tr>`;
    }).join('');
  }

  function renderWatchlist() {
    const rows = state.watchlist;
    el.watchlistEmpty.style.display = rows.length ? 'none' : 'block';
    el.watchlistBody.innerHTML = rows.map(sym => {
      const stock = STOCKS.find(s => s.symbol === sym);
      const { change, pct } = dayChange(sym);
      const cls = change >= 0 ? 'up' : 'down';
      return `<tr>
        <td>${sym}</td>
        <td>${stock.name}</td>
        <td>${fmtMoney(market[sym].price)}</td>
        <td class="${cls}">${fmtSigned(change)} (${pct.toFixed(2)}%)</td>
        <td><button class="mini-remove" data-remove-watch="${sym}">Remove</button></td>
      </tr>`;
    }).join('');
  }

  function renderHistory() {
    const rows = [...state.transactions].reverse();
    el.historyEmpty.style.display = rows.length ? 'none' : 'block';
    el.historyBody.innerHTML = rows.map(t => `
      <tr>
        <td>${new Date(t.time).toLocaleTimeString()}</td>
        <td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td>
        <td>${t.symbol}</td>
        <td>${t.qty}</td>
        <td>${fmtMoney(t.price)}</td>
        <td>${fmtMoney(t.total)}</td>
      </tr>`).join('');
  }

  function renderAll() {
    renderTicker();
    renderSummary();
    renderStockSelect();
    renderQuote();
    drawSparkline();
    renderHoldings();
    renderWatchlist();
    renderHistory();
  }

  /* ---------------- Trading logic ---------------- */
  function setTradeMsg(text, kind) {
    el.tradeMsg.textContent = text;
    el.tradeMsg.className = `trade-msg ${kind || ''}`;
  }

  function recordTransaction(side, symbol, qty, price) {
    state.transactions.push({
      time: Date.now(), side, symbol, qty, price, total: qty * price
    });
  }

  function buy(symbol, qty) {
    if (qty <= 0) return setTradeMsg('Enter a quantity greater than zero.', 'error');
    const price = market[symbol].price;
    const cost = price * qty;
    if (cost > state.cash) return setTradeMsg('Not enough cash for this trade.', 'error');

    const h = state.holdings[symbol] || { qty: 0, avgCost: 0 };
    const newQty = h.qty + qty;
    h.avgCost = (h.avgCost * h.qty + cost) / newQty;
    h.qty = newQty;
    state.holdings[symbol] = h;
    state.cash -= cost;

    recordTransaction('BUY', symbol, qty, price);
    setTradeMsg(`Bought ${qty} ${symbol} @ ${fmtMoney(price)}.`, 'success');
    saveState();
    renderAll();
  }

  function sell(symbol, qty) {
    const h = state.holdings[symbol];
    if (qty <= 0) return setTradeMsg('Enter a quantity greater than zero.', 'error');
    if (!h || h.qty < qty) return setTradeMsg('You don\u2019t own enough shares to sell that many.', 'error');

    const price = market[symbol].price;
    const proceeds = price * qty;
    h.qty -= qty;
    state.cash += proceeds;
    if (h.qty === 0) delete state.holdings[symbol];

    recordTransaction('SELL', symbol, qty, price);
    setTradeMsg(`Sold ${qty} ${symbol} @ ${fmtMoney(price)}.`, 'success');
    saveState();
    renderAll();
  }

  /* ---------------- Events ---------------- */
  el.stockSelect.addEventListener('change', e => {
    selectedSymbol = e.target.value;
    setTradeMsg('', '');
    renderQuote();
    drawSparkline();
  });

  el.qtyInput.addEventListener('input', updateEstCost);

  el.tradeForm.addEventListener('submit', e => {
    e.preventDefault();
    buy(selectedSymbol, parseInt(el.qtyInput.value, 10) || 0);
  });

  el.sellBtn.addEventListener('click', () => {
    sell(selectedSymbol, parseInt(el.qtyInput.value, 10) || 0);
  });

  el.watchToggle.addEventListener('click', () => {
    const idx = state.watchlist.indexOf(selectedSymbol);
    if (idx === -1) state.watchlist.push(selectedSymbol);
    else state.watchlist.splice(idx, 1);
    saveState();
    renderQuote();
    renderWatchlist();
  });

  el.watchlistBody.addEventListener('click', e => {
    const sym = e.target.getAttribute('data-remove-watch');
    if (!sym) return;
    state.watchlist = state.watchlist.filter(s => s !== sym);
    saveState();
    renderQuote();
    renderWatchlist();
  });

  el.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.tabBtns.forEach(b => b.classList.remove('active'));
      el.tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  el.resetBtn.addEventListener('click', () => {
    if (!confirm('Reset your portfolio back to $10,000 virtual cash? This clears all holdings and history.')) return;
    state = defaultState();
    saveState();
    renderAll();
    setTradeMsg('Portfolio reset.', 'success');
  });

  window.addEventListener('resize', drawSparkline);

  /* ---------------- Main loop ---------------- */
  renderAll();
  setInterval(() => {
    stepMarket();
    renderAll();
  }, TICK_MS);

  // Reset each symbol's "prevClose" once a session for cleaner day-change math.
  setTimeout(() => {
    STOCKS.forEach(s => { market[s.symbol].prevClose = market[s.symbol].price; });
  }, 500);

})();
