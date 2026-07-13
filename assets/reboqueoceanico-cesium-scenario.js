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
  const _enuTgt = new Cesium.Cartesian3();
  const _eye = new Cesium.Cartesian3();
  const _tgt = new Cesium.Cartesian3();
  const _hpr = new Cesium.HeadingPitchRange(0, 0, 100);
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

  /**
   * Órbita em torno do pivô (comboio) no mesmo ENU do globo.
   * lookAt(HeadingPitchRange) + unlock: pose correta sem travar o frame.
   * @param {object} camera — THREE.PerspectiveCamera
   * @param {object} target — OrbitControls.target (centro do comboio)
   */
  function syncFromThree(camera, target) {
    if (!ready || !viewer || viewer.isDestroyed() || !camera) return;

    const enuToFixed = ensureEnuMatrix();
    const tx = target && target.x != null ? target.x : 0;
    const ty = target && target.y != null ? target.y : 0;
    const tz = target && target.z != null ? target.z : 0;

    // Offset alvo→câmera no Three (E, U, N) ≡ ENU Cesium (E, N, U) via threeToEnu
    const ox = camera.position.x - tx;
    const oy = camera.position.y - ty;
    const oz = camera.position.z - tz;
    const range = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    const horiz = Math.sqrt(ox * ox + oz * oz);
    // HPR: heading/pitch do offset no frame local East-North-Up do pivô
    _hpr.heading = Math.atan2(ox, oz);           // atan2(East, North)
    _hpr.pitch = Math.atan2(oy, horiz || 1e-9); // elevação (acima do pivô > 0)
    _hpr.range = range;

    threeToEnu(tx, ty, tz, _enuTgt);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuTgt, _tgt);

    viewer.camera.lookAt(_tgt, _hpr);
    // Mantém a pose mas libera o transform (próximo frame pode orbitar de novo)
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

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
