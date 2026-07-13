/**
 * Cenário principal: Cesium Ion + Google Photorealistic 3D Tiles sob o canvas Three.
 * Sync de câmera: eye + pivô OrbitControls + up geográfico (ENU) → ECEF.
 * (Não copiar matrixWorld via threeToEnu — a permutação Y↔Z é reflexão e desalinha a órbita.)
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
    originLat: -23.05,
    originLon: -43.15,
    mPerDegLat: 110852,
    mPerDegLon: 111320 * Math.cos(-23.05 * (Math.PI / 180))
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
      // globe:false — Photorealistic tiles; oceano além do disco Three = backgroundColor
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
        // Azul oceano (não quase-preto): além do disco Three parece mar contínuo na órbita
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a3d5c');
        if (viewer.imageryLayers) {
          while (viewer.imageryLayers.length > 0) {
            viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
          }
        }
        try {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          viewer.resolutionScale = dpr;
        } catch (_) { /* */ }
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
        // scaleX(-1): canvas GE está espelhado (compensa reflexão threeToEnu); desfaz nos créditos
        cc.style.transform = 'scaleX(-1) scale(0.75)';
        cc.style.transformOrigin = 'bottom left';
        cc.style.opacity = '0.75';
      }

      try {
        tileset = await Cesium.createGooglePhotorealistic3DTileset();
        // SSE baixo + dynamic SSE: costa permanece no zoom out / horizonte (~10–20 km)
        tileset.maximumScreenSpaceError = 4;
        tileset.dynamicScreenSpaceError = true;
        if (tileset.dynamicScreenSpaceErrorDensity != null) tileset.dynamicScreenSpaceErrorDensity = 2.0e-4;
        if (tileset.dynamicScreenSpaceErrorFactor != null) tileset.dynamicScreenSpaceErrorFactor = 24.0;
        if (tileset.preloadWhenHidden != null) tileset.preloadWhenHidden = true;
        if (tileset.cullWithChildrenBounds != null) tileset.cullWithChildrenBounds = false;
        viewer.scene.primitives.add(tileset);
      } catch (tileErr) {
        console.warn('[T-Sim] Photorealistic 3D Tiles (cenário) falharam:', tileErr);
        destroyViewer();
        return false;
      }

      // Plano de corte longo: costa do Rio fica a ~8–15 km do ponto ao largo
      try {
        const fr0 = viewer.camera.frustum;
        if (fr0) {
          fr0.near = 1.0;
          fr0.far = 120000.0;
        }
      } catch (_) { /* */ }

      ready = true;
      console.info('[T-Sim] cenário GE Photorealistic ativo (underlay, horizonte ~120 km)');
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
  const _enuTarget = new Cesium.Cartesian3();
  const _enuUp = new Cesium.Cartesian3(0, 0, 1);
  const _enuEast = new Cesium.Cartesian3(1, 0, 0);
  const _eye = new Cesium.Cartesian3();
  const _targetEcef = new Cesium.Cartesian3();
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

  /**
   * Sync OrbitControls → Cesium: eye + pivô (target) + up geográfico.
   *
   * threeToEnu (x,y,z)→(x,z,y) tem det−1: a vista ECEF fica espelhada face ao Three,
   * e a órbita GE sai no sentido contrário ao comboio. O espelho é compensado em CSS
   * (#cesium-scenario canvas { transform: scaleX(-1) }) para comboio e costa girarem iguais.
   */
  function syncFromThree(camera, target) {
    if (!ready || !viewer || viewer.isDestroyed() || !camera) return;

    const enuToFixed = ensureEnuMatrix();

    // 1) Eye (mundo Three)
    let ex, ey, ez;
    if (camera.matrixWorld && camera.matrixWorld.elements) {
      const e = camera.matrixWorld.elements;
      ex = e[12]; ey = e[13]; ez = e[14];
    } else {
      ex = camera.position.x; ey = camera.position.y; ez = camera.position.z;
    }
    threeToEnu(ex, ey, ez, _enuPos);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuPos, _eye);

    // 2) Pivô OrbitControls (centro do comboio nos modos follow)
    let tx, ty, tz;
    if (target && typeof target.x === 'number') {
      tx = target.x; ty = target.y; tz = target.z;
    } else {
      // Fallback: ponto à frente da câmera (~distância típica de órbita)
      tx = ex; ty = ey; tz = ez - 200;
    }
    threeToEnu(tx, ty, tz, _enuTarget);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuTarget, _targetEcef);

    // 3) Up geográfico (ENU +Z) — mesmo “chão” do OrbitControls (+Y Three)
    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _enuUp, _up);
    Cesium.Cartesian3.normalize(_up, _up);

    // 4) Direção = target − eye (órbita em torno do pivô, não rotação do comboio)
    Cesium.Cartesian3.subtract(_targetEcef, _eye, _dir);
    const dirLen = Cesium.Cartesian3.magnitude(_dir);
    if (dirLen < 1e-3) return;
    Cesium.Cartesian3.divideByScalar(_dir, dirLen, _dir);

    // Se quase nadir/zenith, estabiliza right com um eixo auxiliar
    const align = Math.abs(Cesium.Cartesian3.dot(_dir, _up));
    if (align > 0.995) {
      Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _enuEast, _up);
      Cesium.Cartesian3.normalize(_up, _up);
    }

    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    Cesium.Cartesian3.clone(_eye, viewer.camera.position);
    Cesium.Cartesian3.clone(_dir, viewer.camera.direction);
    Cesium.Cartesian3.clone(_up, viewer.camera.up);
    Cesium.Cartesian3.cross(viewer.camera.direction, viewer.camera.up, viewer.camera.right);
    Cesium.Cartesian3.normalize(viewer.camera.right, viewer.camera.right);
    Cesium.Cartesian3.cross(viewer.camera.right, viewer.camera.direction, viewer.camera.up);
    Cesium.Cartesian3.normalize(viewer.camera.up, viewer.camera.up);

    // 5) FOV + clipping
    const vFov = (camera.fov != null ? camera.fov : 75) * (Math.PI / 180);
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fr = viewer.camera.frustum;
    if (fr && fr.fov != null) {
      fr.fov = hFov;
      if (fr.aspectRatio != null) fr.aspectRatio = aspect;
      fr.near = Math.max(1.0, (typeof camera.near === 'number' ? camera.near : 1));
      fr.far = Math.max(120000, typeof camera.far === 'number' ? camera.far : 80000);
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
