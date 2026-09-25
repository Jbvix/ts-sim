/**
 * reboqueoceanico-drills.js — Exercícios scored (MVP)
 * 3 drills: MSC Hs hold MBL util, scope vs clearance, SURGE response.
 * Hooks into animate/update loop via window.__simDrills.
 *
 * API: window.__simDrills
 */
(function () {
  'use strict';

  const DRILLS = [
    {
      id: 'msc_mbl',
      name: 'MSC Hs — Manter MBL',
      desc: 'Com preset MSC (Hs 5 m, vento 20 m/s), manter util. MBL abaixo de 75% durante 60 s.',
      durationS: 60,
      setupFn: function (api) {
        if (api.applyEnvPreset) api.applyEnvPreset({ windSpeed: 20, windDir: 90, currentSpeed: 0.5, currentDir: 90, waveHeight: 5 });
      },
      checkFn: function (_dt, state) {
        return state.utilMBL < 0.75;
      },
      failMsg: 'Util. MBL excedeu 75%. Considere pagar mais cabo ou reduzir RPM.'
    },
    {
      id: 'scope_clearance',
      name: 'Scope vs Clearance',
      desc: 'Ajuste o guincho para manter flecha (sag) ≥ 8 m e folga (L−S3) ≥ 15 m por 45 s, sem tocar o fundo.',
      durationS: 45,
      setupFn: null,
      checkFn: function (_dt, state) {
        var sag = state.sag || 0;
        var folga = state.folga || 0;
        return sag >= 8 && folga >= 15;
      },
      failMsg: 'Flecha < 8 m ou folga < 15 m. Lance mais cabo com cuidado.'
    },
    {
      id: 'surge_response',
      name: 'Resposta a SURGE',
      desc: 'Ao detectar SURGE, reduza RPM ou pague cabo para sair de SURGE em menos de 15 s.',
      durationS: 60,
      _surgeDetected: false,
      _surgeDetectedAt: 0,
      _responded: false,
      setupFn: function () {
        this._surgeDetected = false;
        this._surgeDetectedAt = 0;
        this._responded = false;
      },
      checkFn: function (dt, state, elapsed) {
        if (!this._surgeDetected && state.surge) {
          this._surgeDetected = true;
          this._surgeDetectedAt = elapsed;
        }
        if (this._surgeDetected && !this._responded) {
          if (!state.surge) {
            this._responded = true;
            return true;
          }
          if ((elapsed - this._surgeDetectedAt) > 15) {
            return false;
          }
        }
        return true;
      },
      failMsg: 'SURGE não resolvido em 15 s. Pague cabo e/ou reduza RPM imediatamente.'
    }
  ];

  var _activeDrill = null;
  var _drillElapsed = 0;
  var _drillPassed = true;
  var _drillDone = false;
  var _api = {};
  var _panelEl = null;

  function getState() {
    var ts = window.TowSafety || {};
    var towF = window._lastTowF || {};
    var cable = window._simCableRef;
    var mbl = (ts.cable && ts.cable.MBL > 0) ? ts.cable.MBL : 2.45e6;
    var tN = ts.lastTensionN || 0;
    return {
      tensionN: tN,
      utilMBL: mbl > 0 ? tN / mbl : 0,
      surge: !!ts.surgeOn,
      dTdt: ts.dTdt || 0,
      sag: (towF && Number.isFinite(towF.sag)) ? towF.sag : 0,
      folga: cable ? Math.max(0, cable.length - (towF.S3 || 0)) : 0,
      cableLength: cable ? cable.length : 0,
      s3: towF.S3 || 0
    };
  }

  function renderPanel() {
    if (!_panelEl) {
      _panelEl = document.createElement('div');
      _panelEl.id = 'drills-panel';
      _panelEl.className = 'drills-panel';
      _panelEl.innerHTML =
        '<div class="drills-panel-hdr">' +
          '<span class="drills-panel-title">Exercícios</span>' +
          '<button type="button" class="drills-panel-close" id="drillsClose" title="Fechar">&times;</button>' +
        '</div>' +
        '<div id="drillsList" class="drills-list"></div>' +
        '<div id="drillActive" class="drill-active" style="display:none;"></div>' +
        '<div id="drillResult" class="drill-result" style="display:none;"></div>';
      document.body.appendChild(_panelEl);

      var style = document.createElement('style');
      style.textContent =
        '.drills-panel{position:fixed;bottom:80px;right:16px;z-index:800;width:320px;max-width:90vw;' +
        'background:rgba(15,23,42,.94);border:1px solid rgba(56,189,248,.3);border-radius:12px;' +
        'font-family:Inter,system-ui,sans-serif;color:#e2e8f0;font-size:12px;backdrop-filter:blur(10px);' +
        'box-shadow:0 8px 32px rgba(0,0,0,.45);display:none;}' +
        '.drills-panel.open{display:block;}' +
        '.drills-panel-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
        'border-bottom:1px solid rgba(148,163,184,.15);}' +
        '.drills-panel-title{font-weight:700;font-size:13px;color:#7dd3fc;}' +
        '.drills-panel-close{background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:0 4px;}' +
        '.drills-list{padding:8px 12px;}' +
        '.drill-item{padding:8px 10px;margin:4px 0;border-radius:8px;background:rgba(30,41,59,.6);cursor:pointer;transition:background .15s;}' +
        '.drill-item:hover{background:rgba(56,189,248,.15);}' +
        '.drill-item-name{font-weight:600;font-size:12px;color:#f0f9ff;}' +
        '.drill-item-desc{font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.4;}' +
        '.drill-active{padding:12px 14px;}' +
        '.drill-active-name{font-weight:700;font-size:13px;color:#fbbf24;margin-bottom:6px;}' +
        '.drill-active-timer{font-family:"Barlow Condensed",monospace;font-size:22px;font-weight:700;color:#38bdf8;}' +
        '.drill-active-status{margin-top:4px;font-size:11px;}' +
        '.drill-active-bar{height:4px;background:rgba(148,163,184,.2);border-radius:2px;margin-top:8px;overflow:hidden;}' +
        '.drill-active-fill{height:100%;background:#38bdf8;transition:width .3s;}' +
        '.drill-active-abort{margin-top:10px;padding:4px 12px;background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);' +
        'color:#fca5a5;border-radius:6px;font-size:11px;cursor:pointer;}' +
        '.drill-result{padding:12px 14px;}' +
        '.drill-result-title{font-weight:700;font-size:14px;margin-bottom:4px;}' +
        '.drill-result-title.pass{color:#4ade80;}' +
        '.drill-result-title.fail{color:#f87171;}' +
        '.drill-result-msg{font-size:11px;color:#cbd5e1;line-height:1.5;}' +
        '.drill-result-btn{margin-top:10px;padding:4px 14px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.3);' +
        'color:#7dd3fc;border-radius:6px;font-size:11px;cursor:pointer;}';
      document.head.appendChild(style);

      document.getElementById('drillsClose').addEventListener('click', function () {
        _panelEl.classList.remove('open');
      });
    }

    var listEl = document.getElementById('drillsList');
    listEl.innerHTML = '';
    DRILLS.forEach(function (d) {
      var div = document.createElement('div');
      div.className = 'drill-item';
      div.innerHTML =
        '<div class="drill-item-name">' + d.name + '</div>' +
        '<div class="drill-item-desc">' + d.desc + '</div>';
      div.addEventListener('click', function () { startDrill(d.id); });
      listEl.appendChild(div);
    });
  }

  function startDrill(id) {
    var d = DRILLS.find(function (x) { return x.id === id; });
    if (!d) return;
    _activeDrill = d;
    _drillElapsed = 0;
    _drillPassed = true;
    _drillDone = false;
    if (d.setupFn) d.setupFn.call(d, _api);

    document.getElementById('drillsList').style.display = 'none';
    document.getElementById('drillResult').style.display = 'none';
    var el = document.getElementById('drillActive');
    el.style.display = 'block';
    el.innerHTML =
      '<div class="drill-active-name">' + d.name + '</div>' +
      '<div class="drill-active-timer" id="drillTimer">0:00</div>' +
      '<div class="drill-active-status" id="drillStatus">A decorrer…</div>' +
      '<div class="drill-active-bar"><div class="drill-active-fill" id="drillFill" style="width:0%"></div></div>' +
      '<button type="button" class="drill-active-abort" id="drillAbort">Cancelar</button>';
    document.getElementById('drillAbort').addEventListener('click', function () { endDrill(false, 'Cancelado pelo utilizador.'); });
  }

  function endDrill(passed, msg) {
    _drillDone = true;
    document.getElementById('drillActive').style.display = 'none';
    var rEl = document.getElementById('drillResult');
    rEl.style.display = 'block';
    rEl.innerHTML =
      '<div class="drill-result-title ' + (passed ? 'pass' : 'fail') + '">' +
        (passed ? 'APROVADO' : 'REPROVADO') +
      '</div>' +
      '<div class="drill-result-msg">' + (msg || '') + '</div>' +
      '<button type="button" class="drill-result-btn" id="drillBack">Voltar aos exercícios</button>';
    document.getElementById('drillBack').addEventListener('click', function () {
      rEl.style.display = 'none';
      document.getElementById('drillsList').style.display = '';
      _activeDrill = null;
    });
  }

  function tick(dt) {
    if (!_activeDrill || _drillDone) return;
    _drillElapsed += dt;
    var d = _activeDrill;
    var state = getState();

    var ok = d.checkFn.call(d, dt, state, _drillElapsed);
    if (!ok) _drillPassed = false;

    var pct = Math.min(100, (_drillElapsed / d.durationS) * 100);
    var timerEl = document.getElementById('drillTimer');
    var fillEl = document.getElementById('drillFill');
    var statusEl = document.getElementById('drillStatus');
    if (timerEl) {
      var m = Math.floor(_drillElapsed / 60);
      var s = Math.floor(_drillElapsed % 60);
      timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }
    if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
    if (statusEl) statusEl.textContent = _drillPassed ? 'Dentro dos limites' : 'Fora dos limites!';
    if (statusEl) statusEl.style.color = _drillPassed ? '#4ade80' : '#f87171';

    if (_drillElapsed >= d.durationS) {
      endDrill(_drillPassed, _drillPassed ? 'Exercício concluído com sucesso.' : (d.failMsg || 'Critério não mantido.'));
    }
    if (d.id === 'surge_response' && d._surgeDetected && !d._responded && (_drillElapsed - d._surgeDetectedAt) > 15) {
      endDrill(false, d.failMsg);
    }
  }

  function open() {
    renderPanel();
    _panelEl.classList.add('open');
  }

  function init(api) {
    _api = api || {};
    renderPanel();
  }

  window.__simDrills = {
    init: init,
    open: open,
    tick: tick,
    isRunning: function () { return !!_activeDrill && !_drillDone; }
  };
})();
