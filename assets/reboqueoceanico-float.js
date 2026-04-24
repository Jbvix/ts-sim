  /**
   * Janelas flutuantes do trilho (rail) e sincronização de estado.
   * IIFE: não polui o escopo global (exceto window.__simFloat).
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

    function bringFront(wrap) {
      zStack += 1;
      wrap.style.zIndex = String(zStack);
    }

    function attachDrag(wrap, handle) {
      let dx = 0, dy = 0, startX, startY, origL, origT, dragging = false;
      const lim = () => {
        const r = wrap.getBoundingClientRect();
        const maxL = Math.max(8, window.innerWidth - r.width - 8);
        const maxT = Math.max(64, window.innerHeight - 48);
        return { maxL, maxT };
      };
      handle.addEventListener('mousedown', (e) => {
        if (e.target && e.target.closest('button')) return;
        dragging = true;
        bringFront(wrap);
        startX = e.clientX;
        startY = e.clientY;
        const br = wrap.getBoundingClientRect();
        origL = br.left;
        origT = br.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        dx = e.clientX - startX;
        dy = e.clientY - startY;
        let nl = origL + dx;
        let nt = origT + dy;
        const { maxL, maxT } = lim();
        nl = Math.min(Math.max(8, nl), maxL);
        nt = Math.min(Math.max(64, nt), maxT);
        wrap.style.left = nl + 'px';
        wrap.style.top = nt + 'px';
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    }

    function attachResize(wrap, handle) {
      let r0, w0, h0, sx, sy, active = false;
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        active = true;
        bringFront(wrap);
        const r = wrap.getBoundingClientRect();
        w0 = r.width;
        h0 = r.height;
        sx = e.clientX;
        sy = e.clientY;
        const move = (ev) => {
          if (!active) return;
          const dw = ev.clientX - sx;
          const dh = ev.clientY - sy;
          let nw = Math.round(w0 + dw);
          let nh = Math.round(h0 + dh);
          nw = Math.min(Math.max(260, nw), window.innerWidth - 16);
          nh = Math.min(Math.max(120, nh), window.innerHeight - 72);
          wrap.style.width = nw + 'px';
          wrap.style.maxHeight = nh + 'px';
        };
        const up = () => {
          active = false;
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }

    ORDER.forEach((pid, i) => {
      const inner = document.getElementById(pid);
      if (!inner) return;
      const wrap = document.createElement('div');
      wrap.id = pid;
      wrap.className = 'sim-float-window hidden';
      const left = 20 + (i % 3) * 28;
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
      const title = document.createElement('span');
      title.className = 'sim-float-title';
      title.textContent = TITLES[pid] || pid;
      const tools = document.createElement('div');
      tools.className = 'sim-float-tools';
      const btnMin = document.createElement('button');
      btnMin.type = 'button';
      btnMin.className = 'sim-float-btn sim-float-min';
      btnMin.setAttribute('aria-label', 'Minimizar');
      btnMin.textContent = '−';
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'sim-float-btn sim-float-close';
      btnClose.setAttribute('aria-label', 'Fechar');
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
      header.addEventListener('mousedown', () => bringFront(wrap));
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
        bringFront(w);
      } else if (w.classList.contains('sim-float--min')) {
        w.classList.remove('sim-float--min');
        bringFront(w);
      } else {
        w.classList.add('sim-float--min');
        bringFront(w);
      }
      syncRail();
    }

    window.__simFloat = { openGroup, bringFront, byGroup, syncRail };
    syncRail();
  })();
