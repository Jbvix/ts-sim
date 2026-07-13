/**
 * Cenário principal: Cesium Ion + Google Photorealistic 3D Tiles sob o canvas Three.
 * Sync de câmera: mesma pose ENU frame-a-frame (matrixWorld Three → ECEF).
 *
 * API: window.__simCesiumScenario
 *   .tryInit(rioGeo) → Promise<boolean>
 *   .syncFromThree(camera, target)
 *   .resize() / .setActive(boolean) / .destroy() / .ready
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
      // requestRenderMode:false → render contínuo, alinhado ao animate() do Three
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
        requestRenderMode: false,
        useDefaultRenderLoop: true
      });

      try {
        viewer.scene.skyBox = undefined;
        viewer.scene.sun = undefined;
        viewer.scene.moon = undefined;
        viewer.scene.skyAtmosphere = undefined;
        if (viewer.scene.globe) viewer.scene.globe.show = false;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#051d40');
        if (viewer.imageryLayers) {
          while (viewer.imageryLayers.length > 0) {
            viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
          }
        }
        // Desativa controller Cesium (só o OrbitControls do Three mexe na vista)
        if (viewer.scene.screenSpaceCameraController) {
          const c = viewer.scene.screenSpaceCameraController;
          c.enableInputs = false;
          c.enableRotate = false;
          c.enableTranslate = false;
          c.enableZoom = false;
          c.enableTilt = false;
          c.enableLook = false;
        }
      } catch (_) { /* */ }

      if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
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

      ready = true;
      console.info('[T-Sim] cenário GE Photorealistic ativo (underlay, sync ENU contínuo)');
      return true;
    } catch (err) {
      console.error('[T-Sim] falha ao iniciar cenário Cesium:', err);
      destroyViewer();
      return false;
    }
  }

  /**
   * Three: +X East, +Y Up, +Z North
   * Cesium ENU: +X East, +Y North, +Z Up
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
  const _right = new Cesium.Cartesian3();
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
   * Copia a pose exata da câmera Three (matrixWorld) para o Cesium via ENU único.
   * Garante que o comboio e o cenário giram juntos na mesma posição.
   */
  function syncFromThree(camera, _target) {
    if (!ready || !viewer || viewer.isDestroyed() || !camera) return;
    if (!camera.matrixWorld || !camera.matrixWorld.elements) return;

    const enuToFixed = ensureEnuMatrix();

    // 1) Posição eye
    threeToEnu(camera.position.x, camera.position.y, camera.position.z, _enuPos);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuPos, _eye);

    // 2) Eixos a partir da matrixWorld (após OrbitControls.update)
    // Three: col0=right, col1=up, col2=back; forward = -col2
    const e = camera.matrixWorld.elements;
    let fx = -e[8], fy = -e[9], fz = -e[10];
    let ux = e[4], uy = e[5], uz = e[6];

    let fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    let ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;

    // Ortonormaliza: right = forward × up, up = right × forward
    let rx = fy * uz - fz * uy;
    let ry = fz * ux - fx * uz;
    let rz = fx * uy - fy * ux;
    let rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl < 1e-8) {
      ux = 0; uy = 1; uz = 0;
      rx = fy * uz - fz * uy;
      ry = fz * ux - fx * uz;
      rz = fx * uy - fy * ux;
      rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    }
    rx /= rl; ry /= rl; rz /= rl;
    ux = ry * fz - rz * fy;
    uy = rz * fx - rx * fz;
    uz = rx * fy - ry * fx;

    threeToEnu(fx, fy, fz, _fEnu);
    threeToEnu(ux, uy, uz, _uEnu);
    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _fEnu, _dir);
    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _uEnu, _up);
    Cesium.Cartesian3.normalize(_dir, _dir);
    Cesium.Cartesian3.normalize(_up, _up);

    // 3) Aplica pose em coordenadas mundo (sem lookAt — evita HPR local ≠ ENU origem)
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    Cesium.Cartesian3.clone(_eye, viewer.camera.position);
    Cesium.Cartesian3.clone(_dir, viewer.camera.direction);
    Cesium.Cartesian3.clone(_up, viewer.camera.up);
    Cesium.Cartesian3.cross(viewer.camera.direction, viewer.camera.up, viewer.camera.right);
    Cesium.Cartesian3.normalize(viewer.camera.right, viewer.camera.right);
    Cesium.Cartesian3.cross(viewer.camera.right, viewer.camera.direction, viewer.camera.up);
    Cesium.Cartesian3.normalize(viewer.camera.up, viewer.camera.up);

    // 4) FOV: Three = vertical; Cesium (aspect>=1) = horizontal
    const vFov = (camera.fov != null ? camera.fov : 75) * (Math.PI / 180);
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fr = viewer.camera.frustum;
    if (fr && fr.fov != null) {
      fr.fov = hFov;
      if (fr.aspectRatio != null) fr.aspectRatio = aspect;
      if (typeof camera.near === 'number' && fr.near != null) fr.near = Math.max(0.1, camera.near);
      if (typeof camera.far === 'number' && fr.far != null) fr.far = camera.far;
    }
  }

  function setActive(on) {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.useDefaultRenderLoop = !!on;
  }

  function resize() {
    if (!viewer || viewer.isDestroyed()) return;
    try { viewer.resize(); } catch (_) { /* */ }
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
