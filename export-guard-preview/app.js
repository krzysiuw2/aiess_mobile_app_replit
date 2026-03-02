(function () {
  var API = (window.__EXPORT_GUARD_API__ || '').trim();
  if (!API) API = prompt('Podaj URL API Export Guard (Lambda Function URL):') || '';

  function el(id) { return document.getElementById(id); }
  function setGrid(v) {
    var elm = el('grid');
    if (v == null) { elm.textContent = '—'; return; }
    elm.textContent = v.toFixed(1) + ' kW';
    elm.className = 'value ' + (v < -40 ? 'err' : v < -20 ? 'warn' : 'ok');
  }
  function setInverter(on) {
    el('inverter').textContent = on === true ? 'Włączony' : on === false ? 'Wyłączony (guard)' : '—';
  }
  function setGuard(status, next, lastPower) {
    el('guard').textContent = status === 'cooldown' ? 'Cooldown' : 'Monitoring';
    el('next').textContent = next ? new Date(next).toLocaleString('pl-PL') : '—';
    var wrap = el('turnOnWrap');
    var btn = el('turnOnBtn');
    if (status === 'cooldown') {
      wrap.style.display = 'block';
      btn.disabled = false;
      el('turnOnStatus').textContent = '';
    } else {
      wrap.style.display = 'none';
    }
  }
  function setConfig(exportT, restartT) {
    if (exportT != null) el('exportThreshold').value = exportT;
    if (restartT != null) el('restartThreshold').value = restartT;
  }
  function setUpdated(t) {
    el('updated').textContent = t ? 'Aktualizacja: ' + new Date(t).toLocaleString('pl-PL') : '—';
  }

  function fetchState() {
    if (!API) return;
    fetch(API)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setGrid(d.grid_power_kw);
        setInverter(d.inverter_on);
        var g = d.guard || {};
        setGuard(g.status, g.next_check_at, g.last_grid_power);
        if (d.config) setConfig(d.config.export_threshold, d.config.restart_threshold);
        setUpdated(d.updated_at);
      })
      .catch(function () {
        setGrid(null);
        el('guard').textContent = 'Błąd połączenia';
      });
  }

  el('turnOnBtn').onclick = function () {
    if (!API) return;
    var btn = el('turnOnBtn');
    btn.disabled = true;
    el('turnOnStatus').textContent = 'Włączanie…';
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'turn_on' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        el('turnOnStatus').textContent = d.message || (d.ok ? 'Włączono.' : d.error || 'Błąd.');
        if (d.ok) fetchState(); else btn.disabled = false;
      })
      .catch(function () {
        el('turnOnStatus').textContent = 'Błąd połączenia.';
        btn.disabled = false;
      });
  };

  el('save').onclick = function () {
    var exportT = parseFloat(el('exportThreshold').value);
    var restartT = parseFloat(el('restartThreshold').value);
    if (!API || (isNaN(exportT) && isNaN(restartT))) {
      el('saveStatus').textContent = 'Ustaw URL API i progi.';
      return;
    }
    var body = {};
    if (!isNaN(exportT)) body.export_threshold = exportT;
    if (!isNaN(restartT)) body.restart_threshold = restartT;
    el('saveStatus').textContent = 'Zapisywanie…';
    fetch(API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        el('saveStatus').textContent = d.error || 'Zapisano.';
      })
      .catch(function () {
        el('saveStatus').textContent = 'Błąd zapisu.';
      });
  };

  fetchState();
  setInterval(fetchState, 60000);
})();
