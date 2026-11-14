// Launch Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a per-protocol detail view, launch-window buckets, a
// category table, the live-token set and a model sandbox. No network: every byte shown
// is in data.js. The page recomputes each row's implied value from the same five factors
// main.ts used, so the page's arithmetic and board.json agree; the sandbox moves four of
// the model's tunables and re-ranks live, and says so when it does.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var watchlist = {};
  (DATA.watchlist_slugs || []).forEach(function (s) { watchlist[s] = true; });

  var state = {
    q: '', category: 'all', chain: 'all', watchOnly: false,
    sort: 'implied', dir: -1, tab: 'board', selected: null,
    sandbox: null // null = submitted model; else {gain, loss, peak, breadth}
  };

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageFmt(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model in one function: the same five factors lib/radar.ts applies, with the
  // sandbox's tunables swapped in when the reader moves a slider. Each factor is rounded
  // to 4 decimals exactly as main.ts rounds it, so the page's numbers equal board.json's.
  function r4(n) { return Math.round(n * 1e4) / 1e4; }
  function impliedOf(row, t) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(100, Math.max(-50, row.change_7d));
    var momentum = r4(1 + (g / 100) * (g >= 0 ? t.gain : t.loss));
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var win = age <= t.peak
      ? r4(0.55 + 0.45 * Math.pow(age / t.peak, 0.7))
      : r4(Math.max(0.85, 1 - 0.15 * (Math.min(age - t.peak, 1460) / 1460)));
    var br = r4(1 + Math.min(Math.max(row.chains.length - 1, 0), 4) * t.breadth);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * momentum * win * row.heat_multiplier * br));
  }
  function tuning() {
    var d = DATA.tuning;
    return state.sandbox || { gain: d.gain_weight, loss: d.loss_weight, peak: d.window_peak_days, breadth: d.breadth_step };
  }
  function windowLabel(age) {
    if (age === null || age === undefined) return ['late', 'Unknown age'];
    if (age < 180) return ['early', 'Too early'];
    if (age <= 540) return ['sweet', 'Approaching window'];
    if (age <= 1095) return ['sweet', 'Sweet spot'];
    return ['late', 'Late window'];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function visibleRows() {
    var t = tuning();
    var rows = DATA.rows.map(function (r) {
      var copy = {};
      Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
      copy.implied_now = impliedOf(r, t);
      return copy;
    });
    rows.sort(function (a, b) { return b.implied_now - a.implied_now || (a.slug < b.slug ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank_now = i + 1; });
    var q = state.q.trim().toLowerCase();
    rows = rows.filter(function (r) {
      if (state.watchOnly && !watchlist[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_now : key === 'name' ? a.name.toLowerCase() : a[key];
      var vb = key === 'implied' ? b.implied_now : key === 'name' ? b.name.toLowerCase() : b[key];
      if (va === null || va === undefined) va = -Infinity;
      if (vb === null || vb === undefined) vb = -Infinity;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  function header() {
    var top = DATA.rows[0];
    var med = DATA.rows[Math.floor(DATA.rows.length / 2)];
    return el('header', { class: 'top' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Token launch radar · ' + DATA.model_version }),
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { class: 'sub', text: 'Every protocol in the snapshot that records no token, ranked by what its token would be worth if the market priced it like the live-token protocols in its own category. Click any row for its model and its farm plan.' })),
      el('div', { class: 'meta' },
        el('div', { html: 'Snapshot <b>' + esc(DATA.as_of) + '</b>' }),
        el('div', { html: 'Top implied value <b>' + esc(usdFull(top.implied_value_usd)) + '</b>' }),
        el('div', { html: 'Median implied value <b>' + esc(usdFull(med.implied_value_usd)) + '</b>' })));
  }

  function stats() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var cats = DATA.categories.length;
    var chains = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { chains[c] = true; }); });
    return el('section', { class: 'stats' },
      el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Ranked protocols' }), el('div', { class: 'value', text: String(DATA.rows.length) }), el('div', { class: 'note', text: DATA.watchlist_size + ' on the watchlist, the rest found below the floor' })),
      el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Total implied value' }), el('div', { class: 'value', text: usd(total) }), el('div', { class: 'note', text: 'sum of the board, model ' + DATA.model_version })),
      el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Categories covered' }), el('div', { class: 'value', text: String(cats) }), el('div', { class: 'note', text: 'each anchored on its own live comparables' })),
      el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Chains seen' }), el('div', { class: 'value', text: String(Object.keys(chains).length) }), el('div', { class: 'note', text: 'breadth counts toward the ranking' })));
  }

  function tabs() {
    var names = [['board', 'Board'], ['window', 'Launch window'], ['categories', 'Categories'], ['live', 'Live tokens'], ['method', 'Method & sandbox']];
    return el('nav', { class: 'tabs' }, names.map(function (n) {
      return el('button', {
        'aria-selected': state.tab === n[0] ? 'true' : 'false',
        text: n[1],
        onclick: function () { state.tab = n[0]; render(); }
      });
    }));
  }

  function toolbar() {
    var cats = ['all'].concat(DATA.categories.map(function (c) { return c.category; }));
    var chains = ['all'];
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var wrap = el('div', { class: 'toolbar' });
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; renderBoard(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' }, cats.map(function (c) {
      return el('option', { value: c, text: c === 'all' ? 'All categories' : c, selected: state.category === c ? 'selected' : null });
    }));
    catSel.addEventListener('change', function () { state.category = catSel.value; renderBoard(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, chains.map(function (c) {
      return el('option', { value: c, text: c === 'all' ? 'All chains' : c, selected: state.chain === c ? 'selected' : null });
    }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; renderBoard(); });
    var watchBox = el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; renderBoard(); });
    var sortSel = el('select', { 'aria-label': 'Sort by' }, [
      ['implied', 'Sort: implied value'], ['tvl_usd', 'Sort: TVL'], ['change_7d', 'Sort: 7-day change'], ['age_days', 'Sort: age'], ['name', 'Sort: name']
    ].map(function (o) { return el('option', { value: o[0], text: o[1], selected: state.sort === o[0] ? 'selected' : null }); }));
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; renderBoard(); });
    wrap.appendChild(search);
    wrap.appendChild(catSel);
    wrap.appendChild(chainSel);
    wrap.appendChild(el('label', null, watchBox, document.createTextNode(' Watchlist only')));
    wrap.appendChild(sortSel);
    wrap.appendChild(el('span', { class: 'count', id: 'rowcount' }));
    return wrap;
  }

  function boardTable(rows) {
    var max = 0;
    rows.forEach(function (r) { if (r.implied_now > max) max = r.implied_now; });
    var table = el('table', { class: 'board' });
    var head = el('tr', null);
    [['rank_now', '#'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'Age'], ['implied_now', 'Implied value']].forEach(function (c) {
      var th = el('th', { text: c[1] + (state.sort === c[0] ? (state.dir === -1 ? ' ↓' : ' ↑') : '') });
      if (c[0] === 'tvl_usd' || c[0] === 'change_7d' || c[0] === 'age_days' || c[0] === 'implied_now') th.className = 'num';
      th.addEventListener('click', function () {
        if (state.sort === c[0]) state.dir = -state.dir; else { state.sort = c[0]; state.dir = c[0] === 'name' ? 1 : -1; }
        renderBoard();
      });
      head.appendChild(th);
    });
    table.appendChild(el('thead', null, head));
    var body = el('tbody', null);
    rows.forEach(function (r) {
      var w = windowLabel(r.age_days);
      var chg = r.change_7d === null ? 'flat' : (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat');
      var tr = el('tr', { class: state.selected === r.slug ? 'sel' : null });
      tr.addEventListener('click', function () { select(r.slug); });
      tr.appendChild(el('td', { class: 'rank', text: String(r.rank_now) }));
      var nameCell = el('td', { class: 'pname' });
      nameCell.appendChild(document.createTextNode(r.name + ' '));
      nameCell.appendChild(el('span', { class: 'pslug', text: r.slug }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }));
      tr.appendChild(el('td', { class: 'num', text: usd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + chg, text: pct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: ageFmt(r.age_days) }));
      var imp = el('td', { class: 'num' });
      imp.appendChild(el('span', { class: 'bar', style: 'width:' + Math.max(4, Math.round(70 * r.implied_now / max)) + 'px' }));
      imp.appendChild(document.createTextNode(' ' + usd(r.implied_now)));
      tr.appendChild(imp);
      var tag = el('td', null);
      tag.appendChild(el('span', { class: 'pill ' + w[0], text: w[1] }));
      if (watchlist[r.slug]) tag.appendChild(document.createTextNode(' '));
      if (watchlist[r.slug]) tag.appendChild(el('span', { class: 'pill watch', text: 'Watchlist' }));
      tr.appendChild(tag);
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function detailView() {
    if (!state.selected) return null;
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.selected) r = x; });
    if (!r) return null;
    var t = tuning();
    var now = impliedOf(r, t);
    var cat = null;
    DATA.categories.forEach(function (c) { if (c.category === (r.category || 'Uncategorised')) cat = c; });
    var w = windowLabel(r.age_days);
    var base = r.tvl_usd * r.category_multiple;
    var box = el('section', { class: 'detail' });
    var head = el('div', { class: 'dhead' },
      el('div', null,
        el('h2', { text: '#' + r.rank + ' · ' + r.name }),
        el('div', { class: 'facts' },
          el('span', { html: 'TVL <b>' + esc(usdFull(r.tvl_usd)) + '</b>' }),
          el('span', { html: '7d <b>' + esc(pct(r.change_7d)) + '</b>' }),
          el('span', { html: 'Age <b>' + esc(ageFmt(r.age_days)) + '</b>' }),
          el('span', { html: 'Chains <b>' + esc(r.chains.join(', ') || '—') + '</b>' }),
          el('span', { html: 'Category <b>' + esc(r.category || '—') + '</b>' }))),
      el('button', { class: 'close', text: 'Close ×', onclick: function () { select(null); } }));
    box.appendChild(head);
    box.appendChild(el('p', { html: '<b>' + esc(usdFull(now)) + '</b> implied value under model ' + esc(DATA.model_version) + ' — ' + esc(w[1]) + ' for a launch. This protocol <b>records no token</b>: the snapshot carries no market cap, CoinGecko id or symbol for it, which is not proof it has none.' }));
    var mrows = [
      ['Base — TVL × category multiple (' + r.category_multiple.toFixed(4) + '×)', usdFull(base), ''],
      ['Momentum — 7d ' + pct(r.change_7d) + ' (×' + r.momentum_multiplier.toFixed(4) + ')', '×' + r.momentum_multiplier.toFixed(4), ''],
      ['Launch window — ' + ageFmt(r.age_days) + ' with no token (×' + r.window_multiplier.toFixed(4) + ')', '×' + r.window_multiplier.toFixed(4), ''],
      ['Category heat — live ' + (r.category || 'Uncategorised') + ' median 7d (×' + r.heat_multiplier.toFixed(4) + ')', '×' + r.heat_multiplier.toFixed(4), ''],
      ['Breadth — ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' (×' + r.breadth_multiplier.toFixed(4) + ')', '×' + r.breadth_multiplier.toFixed(4), ''],
      ['Implied value', usdFull(now), '']
    ];
    var mt = el('table', { class: 'model' });
    mrows.forEach(function (m, i) {
      mt.appendChild(el('tr', { class: i === mrows.length - 1 ? 'total' : null },
        el('td', { text: m[0] }), el('td', { class: 'num', text: m[1] })));
    });
    box.appendChild(el('h3', { text: 'How the number is built' }));
    box.appendChild(mt);
    if (cat) {
      box.appendChild(el('p', { class: 'note', html: 'Category anchor: <b>' + esc(cat.category) + '</b> multiple <b>' + cat.multiple.toFixed(4) + '×</b> from <b>' + cat.comparables + '</b> live-token comparable' + (cat.comparables === 1 ? '' : 's') + ' (ratios winsorised at 3.0×, shrunk toward the global median ' + DATA.global_multiple.toFixed(4) + '×). Thin categories lean on the whole market — see the Categories tab.' }));
    }
    box.appendChild(el('h3', { text: 'Farm plan — seven steps' }));
    var ol = el('ol', { class: 'farm' });
    r.farm_steps.forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    box.appendChild(ol);
    box.appendChild(el('p', { class: 'note warn', text: 'A farm plan is a starting point, not a promise: airdrops are never guaranteed, and no one should pay to claim one. Verify every step on the protocol’s own site.' }));
    return box;
  }

  function windowTab() {
    var buckets = [
      ['Too early', 'under 180 days with no token — the window is still opening', function (a) { return a !== null && a < 180; }],
      ['Approaching the window', '180 to 540 days — the launch window is at its widest soon', function (a) { return a !== null && a >= 180 && a <= 540; }],
      ['Sweet spot', '540 to 1,095 days — peak launch-window value', function (a) { return a !== null && a > 540 && a <= 1095; }],
      ['Late window', 'over 1,095 days — valuable, but a token may never come', function (a) { return a !== null && a > 1095; }]
    ];
    var wrap = el('div', { class: 'buckets' });
    buckets.forEach(function (b) {
      var rows = DATA.rows.filter(function (r) { return b[2](r.age_days); });
      rows.sort(function (x, y) { return y.implied_value_usd - x.implied_value_usd; });
      var med = rows.length ? rows[Math.floor(rows.length / 2)].implied_value_usd : 0;
      var box = el('div', { class: 'bucket' },
        el('h3', { text: b[0] }),
        el('div', { class: 'big', text: String(rows.length) + ' protocols' }),
        el('div', { class: 'note', text: b[1] }),
        el('div', { class: 'note', text: 'Median implied ' + usd(med) }));
      var top = el('div', { class: 'top' });
      rows.slice(0, 3).forEach(function (r) {
        top.appendChild(el('div', { html: '<span class="r">#' + r.rank + '</span> ' + esc(r.name) + ' — ' + esc(usd(r.implied_value_usd)) }));
      });
      box.appendChild(top);
      wrap.appendChild(box);
    });
    return wrap;
  }

  function categoriesTab() {
    var wrap = el('div', { class: 'cat-wrap' });
    wrap.appendChild(el('p', { class: 'note', text: 'One anchor per category: the median market-cap-to-TVL of its live-token protocols, winsorised at 3.0× and shrunk toward the global median. Categories with few comparables lean on the whole market — that thinness is shown, not hidden.' }));
    var t = el('table', { class: 'plain' });
    t.appendChild(el('tr', null,
      el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Comparables' }), el('th', { class: 'num', text: 'Multiple' }),
      el('th', { class: 'num', text: 'Live median 7d' }), el('th', { class: 'num', text: 'Pre-token' }),
      el('th', { class: 'num', text: 'Pre-token TVL' }), el('th', { text: 'Top protocol' })));
    DATA.categories.forEach(function (c) {
      var tr = el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comparables) }),
        el('td', { class: 'num', text: c.multiple.toFixed(4) + '×' }),
        el('td', { class: 'num', text: pct(c.median_change_7d) }),
        el('td', { class: 'num', text: String(c.pre_token_count) }),
        el('td', { class: 'num', text: usd(c.pre_token_tvl) }),
        el('td', { text: '' }));
      tr.lastChild.textContent = '#' + (function () { var r = null; DATA.rows.forEach(function (x) { if (x.slug === c.top_slug) r = x; }); return r ? r.rank : '?'; })() + ' ' + c.top_name + ' · ' + usd(c.top_implied);
      tr.addEventListener('click', function () { select(c.top_slug); });
      tr.style.cursor = 'pointer';
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function liveTab() {
    var wrap = el('div', { class: 'live-wrap' });
    wrap.appendChild(el('p', { class: 'note', text: 'These protocols already trade. They are not ranked: the board shows the market’s own values for them, and they are the comparables the pre-token board is anchored on. Top 24 by market cap.' }));
    var t = el('table', { class: 'plain' });
    t.appendChild(el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' })));
    DATA.live.forEach(function (p) {
      t.appendChild(el('tr', null,
        el('td', { text: p.name }),
        el('td', { text: p.category || '—' }),
        el('td', { class: 'num', text: usd(p.tvl_usd) }),
        el('td', { class: 'num', text: usd(p.mcap_usd) }),
        el('td', { class: 'num', text: p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(3) + '×' : 'n/a' }),
        el('td', { class: 'num', text: pct(p.change_7d) })));
    });
    wrap.appendChild(t);
    return wrap;
  }

  function methodTab() {
    var d = DATA.tuning;
    var wrap = el('div', { class: 'method' });
    wrap.appendChild(el('h2', { text: 'The model, in full' }));
    wrap.appendChild(el('p', { class: 'formula', text: 'implied = TVL × category multiple × momentum × launch window × category heat × breadth' }));
    wrap.appendChild(el('ul', null,
      el('li', { text: 'Category multiple — the median market-cap-to-TVL of the live-token protocols in the same category (each ratio winsorised at ' + d.winsor_cap.toFixed(1) + '×), shrunk toward the global median ' + DATA.global_multiple.toFixed(4) + '× with weight n / (n + ' + d.shrink_k + ').' }),
      el('li', { text: 'Momentum — the 7-day TVL change, clamped to [-50, +100]. Gains count at ' + d.gain_weight.toFixed(1) + '× weight, losses at ' + d.loss_weight.toFixed(1) + '×: a protocol losing TVL is a worse bet than a flat one.' }),
      el('li', { text: 'Launch window — a hump over age with no token: 0.55 at listing, rising to 1.00 at ' + d.window_peak_days + ' days, then decaying toward a floor of ' + d.window_floor.toFixed(2) + ' for very old protocols.' }),
      el('li', { text: 'Category heat — the median 7-day change of the category’s live comparables, clamped to [-20, +30], at half weight.' }),
      el('li', { text: 'Breadth — 1 + ' + d.breadth_step.toFixed(2) + ' per extra chain, up to ' + d.breadth_cap + ' extra chains.' })));
    wrap.appendChild(el('p', { class: 'note', text: 'Nothing here is a prediction that a token launches, or when. “Records no token” means the snapshot carries no market cap, CoinGecko id or symbol — a protocol on this board may still have a token its record does not carry. Wrapped, staked and bridged products of tokens that already trade are left out, as are exchanges and versioned pools: they are not launches waiting to happen.' }));
    wrap.appendChild(el('h2', { text: 'Model sandbox — move the tunables, watch the board re-rank' }));
    wrap.appendChild(el('p', { class: 'note', id: 'sandbox-note', text: 'Showing the submitted model. Move a slider to re-rank live; the submitted board is unchanged.' }));
    var grid = el('div', { class: 'sliders' });
    function slider(label, min, max, step, get, set) {
      var lab = el('label', null, document.createTextNode(label + ' '));
      var out = el('output', { text: String(get()) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()) });
      input.addEventListener('input', function () {
        if (!state.sandbox) state.sandbox = { gain: d.gain_weight, loss: d.loss_weight, peak: d.window_peak_days, breadth: d.breadth_step };
        set(parseFloat(input.value));
        out.textContent = input.value;
        var note = document.getElementById('sandbox-note');
        if (note) note.textContent = 'Sandbox active — the board below is re-ranked with your tunables, not the submitted model. Reset the page to return to the submitted board.';
        renderBoard();
      });
      lab.appendChild(out);
      lab.appendChild(input);
      grid.appendChild(lab);
    }
    slider('Gain weight', 0, 1, 0.05, function () { return state.sandbox ? state.sandbox.gain : d.gain_weight; }, function (v) { state.sandbox.gain = v; });
    slider('Loss weight', 0, 2, 0.1, function () { return state.sandbox ? state.sandbox.loss : d.loss_weight; }, function (v) { state.sandbox.loss = v; });
    slider('Window peak (days)', 180, 1095, 15, function () { return state.sandbox ? state.sandbox.peak : d.window_peak_days; }, function (v) { state.sandbox.peak = v; });
    slider('Breadth step', 0, 0.08, 0.005, function () { return state.sandbox ? state.sandbox.breadth : d.breadth_step; }, function (v) { state.sandbox.breadth = v; });
    wrap.appendChild(grid);
    return wrap;
  }

  function select(slug) {
    state.selected = slug;
    if (slug) {
      try { history.replaceState(null, '', '#p=' + slug); } catch (e) { /* file URLs may refuse */ }
    }
    render();
  }

  function renderBoard() {
    var host = document.getElementById('board-host');
    if (!host) return;
    var rows = visibleRows();
    host.innerHTML = '';
    if (state.tab === 'board') {
      var det = detailView();
      if (det) host.appendChild(det);
      var wrap = el('div', { class: 'board-wrap' });
      wrap.appendChild(boardTable(rows));
      host.appendChild(wrap);
    }
    var count = document.getElementById('rowcount');
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' protocols' + (state.sandbox ? ' · sandbox re-rank' : '');
  }

  function render() {
    app.innerHTML = '';
    app.setAttribute('aria-busy', 'false');
    app.appendChild(header());
    app.appendChild(stats());
    app.appendChild(tabs());
    var host = el('div', { id: 'board-host' });
    if (state.tab === 'board') {
      app.appendChild(toolbar());
      app.appendChild(host);
      renderBoard();
    } else if (state.tab === 'window') {
      app.appendChild(host);
      host.appendChild(windowTab());
    } else if (state.tab === 'categories') {
      app.appendChild(host);
      host.appendChild(categoriesTab());
    } else if (state.tab === 'live') {
      app.appendChild(host);
      host.appendChild(liveTab());
    } else if (state.tab === 'method') {
      app.appendChild(host);
      host.appendChild(methodTab());
    }
    app.appendChild(el('footer', null,
      el('p', { text: 'Launch Radar · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.source }),
      el('p', { text: 'Implied values are the model’s own claim, computed from the snapshot’s figures alone. They are not a prediction that any token launches, and a protocol that records no token may still have one. Farm plans are starting points: verify every step on the protocol’s own site and never pay to claim an airdrop.' })));
  }

  // Hash routing, for deep links and the screenshots: #p=<slug>, #f=watchlist,
  // #f=cat:<category>, #tab=window|categories|live|method.
  (function fromHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (k === 'p') state.selected = v;
      else if (k === 'tab' && ['board', 'window', 'categories', 'live', 'method'].indexOf(v) >= 0) state.tab = v;
      else if (k === 'f' && v === 'watchlist') state.watchOnly = true;
      else if (k === 'f' && v.indexOf('cat:') === 0) state.category = v.slice(4);
    });
    if (state.selected) state.tab = 'board';
  })();

  render();
})();
