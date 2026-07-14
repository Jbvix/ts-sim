  /**
   * Janelas flutuantes do trilho (rail) e sincronização de estado.
   * IIFE: não polui o escopo global (exceto window.__simFloat).
   * Mobile: arrasto por pointer (toque) — puxar para baixo = minimizar; fora da área = ocultar.
   */
  (function () {
    'use strict';
    const TITLES = {
      envPanel: 'Ambiente',
      vesselPanel: 'Navio, rebocador e desempenho',
      winchPanel: 'Guincho e cabo',
      towlinePanel: 'Towline Safety',
      catenaryGuidePanel: 'Catenária e trancos',
      buoyPanel: 'Bóias',
      asdPanel: 'Governo ASD (rebocador)',
      twinSafetyPanel: 'TWIN e segurança',
      cameraPanel: 'Câmera 3D',
    };
    const ORDER = ['envPanel', 'vesselPanel', 'winchPanel', 'towlinePanel', 'catenaryGuidePanel', 'buoyPanel', 'asdPanel', 'twinSafetyPanel', 'cameraPanel'];
    const root = document.getElementById('sim-float-root');
    if (!root) return;
    let zStack = 50;
    const byGroup = Object.create(null);

    function isMobileLayout() {
      return window.matchMedia('(max-width: 640px)').matches;
    }

    function bringFront(wrap) {
      zStack += 1;
      wrap.style.zIndex = String(zStack);
    }

    function placeMobileDefault(wrap) {
      if (!isMobileLayout()) return;
      wrap.style.left = '0.35rem';
      wrap.style.right = 'auto';
      wrap.style.top = '4.35rem';
      wrap.style.bottom = 'auto';
      wrap.style.width = 'min(100vw - 0.75rem, 22rem)';
      wrap.style.maxHeight = 'calc(100dvh - var(--sim-rail-bottom-h) - 4.5rem)';
    }

    function attachDrag(wrap, handle, opts) {
      opts = opts || {};
      let dragging = false;
      let startX = 0, startY = 0, origL = 0, origT = 0;
      let pointerId = null;

      const lim = () => {
        const r = wrap.getBoundingClientRect();
        const styles = getComputedStyle(document.documentElement);
        const railW = parseFloat(styles.getPropertyValue('--sim-rail-w')) || 0;
        const railBottom = parseFloat(styles.getPropertyValue('--sim-rail-bottom-h')) || 0;
        const minL = Math.max(4, railW + 2);
        const maxL = Math.max(minL, window.innerWidth - Math.min(r.width, window.innerWidth) - 4);
        const minT = 56;
        const maxT = Math.max(minT, window.innerHeight - 44 - railBottom);
        return { minL, maxL, minT, maxT, railBottom };
      };

      const onDown = (e) => {
        if (e.target && e.target.closest('button, select, a, input, label')) return;
        if (e.button != null && e.button !== 0) return;
        dragging = true;
        pointerId = e.pointerId;
        bringFront(wrap);
        wrap.classList.add('sim-float--dragging');
        startX = e.clientX;
        startY = e.clientY;
        const br = wrap.getBoundingClientRect();
        origL = br.left;
        origT = br.top;
        try { handle.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!dragging) return;
        if (pointerId != null && e.pointerId !== pointerId) return;
        let nl = origL + (e.clientX - startX);
        let nt = origT + (e.clientY - startY);
        const { minL, maxL, minT, maxT } = lim();
        nl = Math.min(Math.max(minL, nl), maxL);
        nt = Math.min(Math.max(minT, nt), maxT);
        wrap.style.left = nl + 'px';
        wrap.style.top = nt + 'px';
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      };

      const onUp = (e) => {
        if (!dragging) return;
        if (pointerId != null && e.pointerId !== pointerId) return;
        dragging = false;
        wrap.classList.remove('sim-float--dragging');
        const dy = e.clientY - startY;
        const dx = e.clientX - startX;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
        pointerId = null;

        if (opts.onGestureEnd) {
          opts.onGestureEnd({ dx, dy, wrap });
          return;
        }

        // Mobile: gestos no cabeçalho — puxar ↓ = minimizar; puxar bem ↓ ou para fora = ocultar
        if (isMobileLayout() && Math.hypot(dx, dy) > 28) {
          const railBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sim-rail-bottom-h')) || 68;
          const br = wrap.getBoundingClientRect();
          if (dy > 90 || br.bottom > window.innerHeight - railBottom + 20) {
            wrap.classList.add('hidden');
            wrap.classList.remove('sim-float--min');
            if (wrap.id === 'buoyPanel' && window.__simClearBuoyPick) {
              try { window.__simClearBuoyPick(); } catch (err) { /* */ }
            }
            syncRail();
            return;
          }
          if (dy > 40) {
            wrap.classList.add('sim-float--min');
            bringFront(wrap);
          }
        }
      };

      handle.addEventListener('pointerdown', onDown);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    }

    function attachResize(wrap, handle) {
      let active = false;
      let w0 = 0, h0 = 0, sx = 0, sy = 0;
      handle.addEventListener('pointerdown', (e) => {
        if (isMobileLayout()) return; // no mobile prioriza arrasto/minimizar
        e.stopPropagation();
        e.preventDefault();
        active = true;
        bringFront(wrap);
        const r = wrap.getBoundingClientRect();
        w0 = r.width;
        h0 = r.height;
        sx = e.clientX;
        sy = e.clientY;
        try { handle.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        const move = (ev) => {
          if (!active) return;
          let nw = Math.round(w0 + (ev.clientX - sx));
          let nh = Math.round(h0 + (ev.clientY - sy));
          nw = Math.min(Math.max(260, nw), window.innerWidth - 16);
          nh = Math.min(Math.max(120, nh), window.innerHeight - 72);
          wrap.style.width = nw + 'px';
          wrap.style.maxHeight = nh + 'px';
        };
        const up = () => {
          active = false;
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }

    ORDER.forEach((pid, i) => {
      const inner = document.getElementById(pid);
      if (!inner) return;
      const wrap = document.createElement('div');
      wrap.id = pid;
      wrap.className = 'sim-float-window hidden';
      const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sim-rail-w')) || 56;
      const left = Math.max(railW + 8, 20) + (i % 3) * 28;
      const top = 88 + (Math.floor(i / 3) * 32) + i * 6;
      wrap.style.left = left + 'px';
      wrap.style.top = top + 'px';
      wrap.style.zIndex = String(50 + i);
      inner.removeAttribute('id');
      inner.classList.remove('hidden');
      if (!inner.classList.contains('panel')) inner.classList.add('panel');
      if (pid === 'asdPanel') inner.classList.add('asd-panel');

      const header = document.createElement('div');
      header.className = 'sim-float-header sim-float-drag';
      header.title = 'Arrastar para mover · no telemóvel: puxar para baixo = minimizar / ocultar';
      const title = document.createElement('span');
      title.className = 'sim-float-title';
      title.textContent = TITLES[pid] || pid;
      const tools = document.createElement('div');
      tools.className = 'sim-float-tools';
      const btnMin = document.createElement('button');
      btnMin.type = 'button';
      btnMin.className = 'sim-float-btn sim-float-min';
      btnMin.setAttribute('aria-label', 'Minimizar');
      btnMin.title = 'Minimizar';
      btnMin.textContent = '−';
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'sim-float-btn sim-float-close';
      btnClose.setAttribute('aria-label', 'Fechar');
      btnClose.title = 'Ocultar painel';
      btnClose.textContent = '×';
      tools.appendChild(btnMin);
      tools.appendChild(btnClose);
      header.appendChild(title);
      header.appendChild(tools);
      const body = document.createElement('div');
      body.className = 'sim-float-body';
      const resize = document.createElement('div');
      resize.className = 'sim-float-resize';
      body.appendChild(inner);
      if (pid === 'buoyPanel') {
        const redBtn = inner.querySelector('#addRedBuoy');
        if (redBtn) {
          redBtn.textContent = 'Bóia encarnada';
          redBtn.title = 'Cor encarnada; em seguida clique no mar (vista 3D)';
        }
      }
      wrap.appendChild(header);
      wrap.appendChild(body);
      wrap.appendChild(resize);
      root.appendChild(wrap);
      byGroup[pid] = wrap;

      btnMin.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('sim-float--min');
        bringFront(wrap);
      });
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.add('hidden');
        wrap.classList.remove('sim-float--min');
        if (pid === 'buoyPanel' && window.__simClearBuoyPick) {
          try { window.__simClearBuoyPick(); } catch (err) { /* */ }
        }
        syncRail();
      });
      header.addEventListener('pointerdown', () => bringFront(wrap));
      attachDrag(wrap, header);
      attachResize(wrap, resize);
    });

    const GROUP_TO_ID = { env: 'envPanel', vessel: 'vesselPanel', winch: 'winchPanel', towline: 'towlinePanel', catGuide: 'catenaryGuidePanel', asd: 'asdPanel', twinSafety: 'twinSafetyPanel', buoy: 'buoyPanel', camera: 'cameraPanel' };

    function syncRail() {
      document.querySelectorAll('.sim-rail').forEach((btn) => {
        if (btn.dataset.mapToggle === 'true') return;
        const gid = btn.dataset.panelGroup;
        const pid = GROUP_TO_ID[gid];
        const w = byGroup[pid];
        const on = w && !w.classList.contains('hidden');
        btn.classList.toggle('sim-rail-active', !!on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function openGroup(group) {
      const pid = GROUP_TO_ID[group];
      const w = byGroup[pid];
      if (!w) return;
      if (w.classList.contains('hidden')) {
        w.classList.remove('hidden', 'sim-float--min');
        placeMobileDefault(w);
        bringFront(w);
      } else if (w.classList.contains('sim-float--min')) {
        w.classList.remove('sim-float--min');
        bringFront(w);
      } else if (isMobileLayout()) {
        // No mobile: 2.º toque no ícone do trilho oculta (em vez de só minimizar)
        w.classList.add('hidden');
        w.classList.remove('sim-float--min');
        if (pid === 'buoyPanel' && window.__simClearBuoyPick) {
          try { window.__simClearBuoyPick(); } catch (err) { /* */ }
        }
      } else {
        w.classList.add('sim-float--min');
        bringFront(w);
      }
      syncRail();
    }

    window.__simFloat = { openGroup, bringFront, byGroup, syncRail, placeMobileDefault, isMobileLayout };
    syncRail();
  })();
