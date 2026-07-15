/**
 * Rota / waypoints numerados — edição no Leaflet, espelho na vista Three 3D.
 * GPX: apenas <wpt>. Origem ENU permanece RIO_GEO (RJ).
 *
 * API: window.__simRoute
 */
(function () {
  'use strict';

  const MAX_WP = 80;
  let deps = null;
  /** @type {{ id: string, n: number, lat: number, lon: number, x: number, z: number, name: string }[]} */
  let waypoints = [];
  let placeMode = false;
  let leafletGroup = null;
  let leafletPoly = null;
  /** @type {any[]} */
  let leafletMarkers = [];
  let threeGroup = null;
  let threeLine = null;
  let _idSeq = 1;

  function rio() {
    return deps && deps.rio;
  }

  function latLngToSim(lat, lon) {
    const r = rio();
    return {
      x: (lon - r.originLon) * r.mPerDegLon,
      z: (lat - r.originLat) * r.mPerDegLat
    };
  }

  function simToLatLng(x, z) {
    if (deps && typeof deps.simXZtoLatLng === 'function') return deps.simXZtoLatLng(x, z);
    const r = rio();
    return {
      lat: r.originLat + z / r.mPerDegLat,
      lon: r.originLon + x / r.mPerDegLon
    };
  }

  function renumber() {
    waypoints.forEach((w, i) => {
      w.n = i + 1;
    });
  }

  function setStatus(msg) {
    const el = document.getElementById('routeStatus');
    if (el) el.textContent = msg || '—';
  }

  function renderList() {
    const ul = document.getElementById('routeWaypointList');
    if (!ul) return;
    ul.innerHTML = '';
    if (!waypoints.length) {
      const li = document.createElement('li');
      li.className = 'route-wp-empty';
      li.textContent = 'Nenhum waypoint. Active «Adicionar» e clique no mapa, ou importe GPX (wpt).';
      ul.appendChild(li);
      return;
    }
    waypoints.forEach((w) => {
      const li = document.createElement('li');
      li.className = 'route-wp-item';
      li.innerHTML =
        '<span class="route-wp-n">' +
        w.n +
        '</span>' +
        '<span class="route-wp-meta" title="' +
        w.lat.toFixed(5) +
        ', ' +
        w.lon.toFixed(5) +
        '">' +
        (w.name || 'WP ' + w.n) +
        '</span>' +
        '<button type="button" class="route-wp-go" data-id="' +
        w.id +
        '" title="Teleportar comboio para este ponto">Iniciar</button>' +
        '<button type="button" class="route-wp-del" data-id="' +
        w.id +
        '" title="Apagar" aria-label="Apagar">×</button>';
      ul.appendChild(li);
    });
    ul.querySelectorAll('.route-wp-go').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = waypoints.find((p) => p.id === btn.getAttribute('data-id'));
        if (w) startTowAtWaypoint(w);
      });
    });
    ul.querySelectorAll('.route-wp-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeWaypoint(btn.getAttribute('data-id'));
      });
    });
  }

  function numberedIcon(n) {
    const L = deps.getLeaflet();
    if (!L) return null;
    return L.divIcon({
      className: 'route-leaflet-icon',
      html: '<div class="route-leaflet-badge">' + n + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function rebuildLeaflet(opts) {
    const fit = !(opts && opts.skipFit);
    const map = deps.getMap && deps.getMap();
    const L = deps.getLeaflet();
    if (!map || !L) return;

    if (!leafletGroup) {
      leafletGroup = L.layerGroup().addTo(map);
    }
    leafletGroup.clearLayers();
    leafletMarkers = [];
    leafletPoly = null;

    if (!waypoints.length) return;

    const latlngs = [];
    waypoints.forEach((w) => {
      const ll = L.latLng(w.lat, w.lon);
      latlngs.push(ll);
      const m = L.marker(ll, {
        draggable: true,
        icon: numberedIcon(w.n),
        title: (w.name || 'WP ' + w.n) + ' · arrastar para mover'
      });
      m._routeId = w.id;
      m.on('drag', () => {
        const p = m.getLatLng();
        const sim = latLngToSim(p.lat, p.lng);
        w.lat = p.lat;
        w.lon = p.lng;
        w.x = sim.x;
        w.z = sim.z;
        if (leafletPoly && waypoints.length >= 2) {
          leafletPoly.setLatLngs(waypoints.map((p2) => L.latLng(p2.lat, p2.lon)));
        }
      });
      m.on('dragend', () => {
        const p = m.getLatLng();
        const sim = latLngToSim(p.lat, p.lng);
        w.lat = p.lat;
        w.lon = p.lng;
        w.x = sim.x;
        w.z = sim.z;
        rebuildThree();
        renderList();
        setStatus('WP ' + w.n + ' movido');
      });
      m.addTo(leafletGroup);
      leafletMarkers.push(m);
    });

    if (latlngs.length >= 2) {
      leafletPoly = L.polyline(latlngs, {
        color: '#38bdf8',
        weight: 3,
        opacity: 0.9,
        dashArray: '8 6'
      }).addTo(leafletGroup);
    }

    if (!fit) return;
    try {
      if (latlngs.length === 1) {
        map.panTo(latlngs[0]);
      } else if (latlngs.length > 1) {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.2), { maxZoom: 13 });
      }
    } catch (_) { /* */ }
  }

  function ensureThree() {
    if (!deps || !deps.THREE || !deps.scene) return null;
    if (threeGroup) return threeGroup;
    threeGroup = new deps.THREE.Group();
    threeGroup.name = 'routeWaypoints3d';
    deps.scene.add(threeGroup);
    return threeGroup;
  }

  function rebuildThree() {
    const THREE = deps && deps.THREE;
    const g = ensureThree();
    if (!THREE || !g) return;

    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }
    threeLine = null;

    const surfaceAt = (x, z) =>
      typeof deps.surfaceYAt === 'function'
        ? deps.surfaceYAt(x, z)
        : deps.getWaterY
          ? deps.getWaterY()
          : 0;
    const matCone = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const matLabel = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

    waypoints.forEach((w) => {
      const wl = surfaceAt(w.x, w.z);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(4.5, 14, 10),
        matCone.clone()
      );
      cone.position.set(w.x, wl + 8, w.z);
      cone.rotation.x = Math.PI;
      cone.userData.routeId = w.id;
      g.add(cone);

      // Disco numerado simples (cilindro baixo) sobre o cone
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.2, 1.2, 16),
        matLabel.clone()
      );
      disc.position.set(w.x, wl + 16, w.z);
      g.add(disc);
    });

    if (waypoints.length >= 2) {
      const pts = waypoints.map((w) => new THREE.Vector3(w.x, surfaceAt(w.x, w.z) + 1.5, w.z));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      threeLine = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0x7dd3fc, linewidth: 2 })
      );
      threeLine.name = 'routePolyline3d';
      g.add(threeLine);
    }
  }

  function refreshAll() {
    renumber();
    rebuildLeaflet();
    rebuildThree();
    renderList();
    const placeBtn = document.getElementById('routePlaceToggle');
    if (placeBtn) {
      placeBtn.classList.toggle('is-active', placeMode);
      placeBtn.setAttribute('aria-pressed', placeMode ? 'true' : 'false');
      placeBtn.textContent = placeMode ? 'Clique no mapa…' : 'Adicionar no mapa';
    }
  }

  function addWaypoint(lat, lon, name) {
    if (waypoints.length >= MAX_WP) {
      setStatus('Limite de ' + MAX_WP + ' waypoints');
      return null;
    }
    const sim = latLngToSim(lat, lon);
    const w = {
      id: 'wp-' + _idSeq++,
      n: waypoints.length + 1,
      lat: lat,
      lon: lon,
      x: sim.x,
      z: sim.z,
      name: name || ''
    };
    waypoints.push(w);
    refreshAll();
    setStatus('WP ' + w.n + ' criado');
    return w;
  }

  function removeWaypoint(id) {
    const i = waypoints.findIndex((w) => w.id === id);
    if (i < 0) return;
    waypoints.splice(i, 1);
    refreshAll();
    setStatus('Waypoint removido');
  }

  function clearWaypoints() {
    waypoints = [];
    refreshAll();
    setStatus('Derrota limpa');
  }

  function setPlaceMode(on) {
    placeMode = !!on;
    const map = deps.getMap && deps.getMap();
    if (map && map.getContainer) {
      const c = map.getContainer();
      if (c) c.style.cursor = placeMode ? 'crosshair' : '';
    }
    refreshAll();
    if (placeMode) {
      setStatus('Clique no mapa para colocar waypoint');
      if (typeof deps.ensureLeafletVisible === 'function') deps.ensureLeafletVisible();
    } else {
      setStatus(waypoints.length ? waypoints.length + ' waypoint(s)' : '—');
    }
  }

  function onMapClick(e) {
    if (!placeMode || !e || !e.latlng) return;
    addWaypoint(e.latlng.lat, e.latlng.lng, '');
  }

  function attachLeafletMap(map) {
    detachLeafletMap();
    if (!map) return;
    map.on('click', onMapClick);
    leafletGroup = null;
    rebuildLeaflet();
  }

  function detachLeafletMap() {
    const map = deps && deps.getMap && deps.getMap();
    if (map) {
      try {
        map.off('click', onMapClick);
      } catch (_) { /* */ }
    }
    if (leafletGroup && map) {
      try {
        map.removeLayer(leafletGroup);
      } catch (_) { /* */ }
    }
    leafletGroup = null;
    leafletPoly = null;
    leafletMarkers = [];
  }

  function parseGpxWpt(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('GPX inválido');
    const nodes = doc.getElementsByTagName('wpt');
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const lat = parseFloat(el.getAttribute('lat'));
      const lon = parseFloat(el.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const nameEl = el.getElementsByTagName('name')[0];
      const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : '';
      out.push({ lat, lon, name });
    }
    return out;
  }

  function importGpxText(text) {
    const list = parseGpxWpt(text);
    if (!list.length) {
      setStatus('GPX sem <wpt> — nada importado');
      return 0;
    }
    let n = 0;
    list.forEach((p) => {
      if (waypoints.length >= MAX_WP) return;
      const sim = latLngToSim(p.lat, p.lon);
      waypoints.push({
        id: 'wp-' + _idSeq++,
        n: waypoints.length + 1,
        lat: p.lat,
        lon: p.lon,
        x: sim.x,
        z: sim.z,
        name: p.name || ''
      });
      n++;
    });
    refreshAll();
    setStatus('Importados ' + n + ' waypoint(s) GPX');
    if (typeof deps.ensureLeafletVisible === 'function') deps.ensureLeafletVisible();
    return n;
  }

  function startTowAtWaypoint(w) {
    if (!w || typeof deps.placeConvoyAt !== 'function') return;
    deps.placeConvoyAt(w.x, w.z);
    setPlaceMode(false);
    setStatus('Reboque iniciado em WP ' + w.n + ' — governe à mão');
    if (typeof deps.afterPlaceConvoy === 'function') deps.afterPlaceConvoy();
  }

  function wirePanel() {
    const placeBtn = document.getElementById('routePlaceToggle');
    const clearBtn = document.getElementById('routeClear');
    const gpxInput = document.getElementById('routeGpxInput');
    const gpxBtn = document.getElementById('routeGpxBtn');

    if (placeBtn && !placeBtn.dataset.wired) {
      placeBtn.dataset.wired = '1';
      placeBtn.addEventListener('click', () => setPlaceMode(!placeMode));
    }
    if (clearBtn && !clearBtn.dataset.wired) {
      clearBtn.dataset.wired = '1';
      clearBtn.addEventListener('click', () => {
        if (waypoints.length && !confirm('Limpar todos os waypoints?')) return;
        clearWaypoints();
      });
    }
    if (gpxBtn && gpxInput && !gpxBtn.dataset.wired) {
      gpxBtn.dataset.wired = '1';
      gpxBtn.addEventListener('click', () => gpxInput.click());
      gpxInput.addEventListener('change', async () => {
        const f = gpxInput.files && gpxInput.files[0];
        gpxInput.value = '';
        if (!f) return;
        try {
          const text = await f.text();
          importGpxText(text);
        } catch (err) {
          setStatus('Falha GPX: ' + (err && err.message ? err.message : String(err)));
        }
      });
    }
    renderList();
  }

  function init(d) {
    deps = d || {};
    wirePanel();
    ensureThree();
    refreshAll();
    setStatus('Origem ENU: RJ (−23.05, −43.15)');
  }

  window.__simRoute = {
    init,
    attachLeafletMap,
    detachLeafletMap,
    rebuildLeaflet,
    rebuildThree,
    setPlaceMode,
    importGpxText,
    getWaypoints: () => waypoints.slice(),
    clearWaypoints,
    addWaypoint
  };
})();
