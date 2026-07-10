/**
 * Cenário principal: Cesium Ion + Google Photorealistic 3D Tiles sob o canvas Three.
 * Não altera física, formação do comboio nem OrbitControls — só geografia visual.
 *
 * API: window.__simCesiumScenario
 *   .tryInit(rioGeo) → Promise<boolean>
 *   .syncFromThree(camera, target)  — eye/target Three (ENU m) → câmera Cesium
 *   .resize()
 *   .setActive(boolean)
 *   .destroy()
 *   .ready
 */
(function () {
  'use strict';

  const TOKEN_URLS = ['/api/cesium-token', '/.netlify/functions/cesium-token'];
  const CESIUM_RELEASE = '1.125';
  const CONTAINER_ID = 'cesium-scenario';

  let viewer = null;
  let tileset = null;
  let ready = false;
  let rio = {
    originLat: -22.95,
    originLon: -43.14,
    mPerDegLat: 110852,
    mPerDegLon: 111320 * Math.cos(-22.95 * (Math.PI / 180))
  };

  async function fetchTokenConfig() {
    let lastErr = null;
    for (const url of TOKEN_URLS) {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastErr = data.error || ('HTTP ' + res.status);
          continue;
        }
        if (data.token) return data;
        lastErr = 'token ausente na resposta';
      } catch (e) {
        lastErr = String(e && e.message ? e.message : e);
      }
    }
    throw new Error(lastErr || 'Falha ao obter CESIUM_API_KEY');
  }

  function ensureCesiumBaseUrl() {
    if (!window.CESIUM_BASE_URL) {
      window.CESIUM_BASE_URL =
        'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_RELEASE + '/Build/Cesium/';
    }
  }

  function simToLL(x, z) {
    return {
      lat: rio.originLat + z / rio.mPerDegLat,
      lon: rio.originLon + x / rio.mPerDegLon
    };
  }

  async function tryInit(rioGeo) {
    const el = document.getElementById(CONTAINER_ID);
    if (!el || ready) return ready;
    if (typeof Cesium === 'undefined') {
      console.warn('[T-Sim] CesiumJS não carregado — cenário sem GE tiles');
      return false;
    }

    if (rioGeo) {
      rio = {
        originLat: rioGeo.originLat != null ? rioGeo.originLat : rio.originLat,
        originLon: rioGeo.originLon != null ? rioGeo.originLon : rio.originLon,
        mPerDegLat: rioGeo.mPerDegLat != null ? rioGeo.mPerDegLat : rio.mPerDegLat,
        mPerDegLon: rioGeo.mPerDegLon != null ? rioGeo.mPerDegLon : rio.mPerDegLon
      };
    }

    ensureCesiumBaseUrl();

    let cfg;
    try {
      cfg = await fetchTokenConfig();
    } catch (err) {
      console.warn('[T-Sim] token Cesium indisponível para cenário:', err.message || err);
      return false;
    }

    Cesium.Ion.defaultAccessToken = cfg.token;
    if (cfg.googleMapsApiKey) {
      Cesium.GoogleMaps.defaultApiKey = cfg.googleMapsApiKey;
    }

    try {
      viewer = new Cesium.Viewer(CONTAINER_ID, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        globe: false,
        skyBox: false,
        skyAtmosphere: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        useDefaultRenderLoop: true
      });

      if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
        // Mantém créditos mínimos (ToS); compacta no canto
        const cc = viewer.cesiumWidget.creditContainer;
        cc.style.display = 'block';
        cc.style.transform = 'scale(0.75)';
        cc.style.transformOrigin = 'bottom left';
        cc.style.opacity = '0.75';
      }

      try {
        tileset = await Cesium.createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(tileset);
      } catch (tileErr) {
        console.warn('[T-Sim] Photorealistic 3D Tiles (cenário) falharam:', tileErr);
        destroyViewer();
        return false;
      }

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#051d40');
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(rio.originLon, rio.originLat, 900),
        orientation: {
          heading: Cesium.Math.toRadians(25),
          pitch: Cesium.Math.toRadians(-28),
          roll: 0
        }
      });

      ready = true;
      console.info('[T-Sim] cenário GE Photorealistic ativo (underlay)');
      viewer.scene.requestRender();
      return true;
    } catch (err) {
      console.error('[T-Sim] falha ao iniciar cenário Cesium:', err);
      destroyViewer();
      return false;
    }
  }

  /**
   * Three local: +X East, +Y Up, +Z North.
   * Cesium ENU:   +X East, +Y North, +Z Up.
   * Usa um único frame ENU na origem RIO_GEO para posição e orientação —
   * assim a órbita do mouse gira o cenário junto com o comboio.
   */
  function threeToEnu(x, y, z, out) {
    out.x = x;
    out.y = z;
    out.z = y;
    return out;
  }

  const _enuPos = new Cesium.Cartesian3();
  const _fEnu = new Cesium.Cartesian3();
  const _uEnu = new Cesium.Cartesian3();
  const _eye = new Cesium.Cartesian3();
  const _dir = new Cesium.Cartesian3();
  const _up = new Cesium.Cartesian3();
  let _enuToFixed = null;
  let _enuOriginLon = null;
  let _enuOriginLat = null;

  function ensureEnuMatrix() {
    if (
      _enuToFixed &&
      _enuOriginLon === rio.originLon &&
      _enuOriginLat === rio.originLat
    ) {
      return _enuToFixed;
    }
    const origin = Cesium.Cartesian3.fromDegrees(rio.originLon, rio.originLat, 0);
    _enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    _enuOriginLon = rio.originLon;
    _enuOriginLat = rio.originLat;
    return _enuToFixed;
  }

  function normalize3(v) {
    const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (m > 1e-12) {
      v.x /= m;
      v.y /= m;
      v.z /= m;
    }
    return v;
  }

  /**
   * Sincroniza a câmera Cesium com a câmera Three (mesma pose ENU / órbita).
   * @param {object} camera — THREE.PerspectiveCamera (matrixWorld atualizado)
   * @param {object} [_target] — ignorado (mantido por compat.); usa eixos da câmera
   */
  function syncFromThree(camera, _target) {
    if (!ready || !viewer || viewer.isDestroyed() || !camera) return;
    if (!camera.matrixWorld || !camera.matrixWorld.elements) return;

    const enuToFixed = ensureEnuMatrix();

    threeToEnu(
      camera.position.x,
      Math.max(2, camera.position.y),
      camera.position.z,
      _enuPos
    );
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuPos, _eye);

    // Basis Three: coluna Z da matrixWorld = eixo local +Z; a câmera olha para -Z
    const e = camera.matrixWorld.elements;
    let fx = -e[8];
    let fy = -e[9];
    let fz = -e[10];
    let ux = e[4];
    let uy = e[5];
    let uz = e[6];
    // Ortonormaliza (forward, up) como o OrbitControls
    let fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = forward × up_approx, depois up = right × forward
    let rx = fy * uz - fz * uy;
    let ry = fz * ux - fx * uz;
    let rz = fx * uy - fy * ux;
    let rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl < 1e-8) {
      ux = 0;
      uy = 1;
      uz = 0;
      rx = fy * uz - fz * uy;
      ry = fz * ux - fx * uz;
      rz = fx * uy - fy * ux;
      rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    }
    rx /= rl;
    ry /= rl;
    rz /= rl;
    ux = ry * fz - rz * fy;
    uy = rz * fx - rx * fz;
    uz = rx * fy - ry * fx;

    threeToEnu(fx, fy, fz, _fEnu);
    threeToEnu(ux, uy, uz, _uEnu);
    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _fEnu, _dir);
    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _uEnu, _up);
    normalize3(_dir);
    normalize3(_up);

    viewer.camera.position = Cesium.Cartesian3.clone(_eye, viewer.camera.position);
    viewer.camera.direction = Cesium.Cartesian3.clone(_dir, viewer.camera.direction);
    viewer.camera.up = Cesium.Cartesian3.clone(_up, viewer.camera.up);
    // right = direction × up (Cesium)
    Cesium.Cartesian3.cross(viewer.camera.direction, viewer.camera.up, viewer.camera.right);
    Cesium.Cartesian3.normalize(viewer.camera.right, viewer.camera.right);
    // Re-ortogonaliza up
    Cesium.Cartesian3.cross(viewer.camera.right, viewer.camera.direction, viewer.camera.up);
    Cesium.Cartesian3.normalize(viewer.camera.up, viewer.camera.up);

    const vFov = (camera.fov != null ? camera.fov : 75) * (Math.PI / 180);
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    if (viewer.camera.frustum && viewer.camera.frustum.fov != null) {
      viewer.camera.frustum.fov = hFov;
    }

    viewer.scene.requestRender();
  }

  function setActive(on) {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.useDefaultRenderLoop = !!on;
    if (on) viewer.scene.requestRender();
  }

  function resize() {
    if (!viewer || viewer.isDestroyed()) return;
    try {
      viewer.resize();
      viewer.scene.requestRender();
    } catch (_) { /* */ }
  }

  function destroyViewer() {
    ready = false;
    try {
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    } catch (_) { /* */ }
    viewer = null;
    tileset = null;
    const el = document.getElementById(CONTAINER_ID);
    if (el) el.innerHTML = '';
  }

  window.__simCesiumScenario = {
    get ready() { return ready; },
    tryInit,
    syncFromThree,
    resize,
    setActive,
    destroy: destroyViewer
  };
})();
