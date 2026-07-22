/**
 * Cenário principal: Cesium Ion + Google Photorealistic 3D Tiles sob o canvas Three.
 * Sync de câmera: eye + pivô OrbitControls + up geográfico (ENU) → ECEF.
 * Céu / sol / lua / atmosfera / névoa / nuvens via applySkyWeather().
 *
 * API: window.__simCesiumScenario
 *   .tryInit(rioGeo) → Promise<boolean>
 *   .syncFromThree(camera, target)
 *   .applySkyWeather(opts)
 *   .resize() / .setActive(boolean) / .destroy() / .ready
 */
(function () {
  'use strict';

  const COMMON = window.__simCesiumCommon;
  const fetchTokenConfig = COMMON.fetchTokenConfig;
  const ensureCesiumBaseUrl = COMMON.ensureCesiumBaseUrl;
  const CONTAINER_ID = 'cesium-scenario';

  let viewer = null;
  let tileset = null;
  let cloudCollection = null;
  let ready = false;
  let lastSkyOpts = null;
  let rio = Object.assign({}, COMMON.RIO_GEO_DEFAULT);

  /** Cesium trata `skyAtmosphere: true` / `skyBox: true` como a *instância* (boolean), não como flag. */
  function isSkyAtmosphereInstance(obj) {
    return !!(obj && typeof obj === 'object' && typeof obj.update === 'function');
  }
  function isSkyBoxInstance(obj) {
    return !!(obj && typeof obj === 'object' && (typeof obj.update === 'function' || obj.sources));
  }

  /** Fator dia 0…1 a partir da hora local (pico ao meio-dia). */
  function dayFactorFromHours(hours) {
    const h = ((Number(hours) % 24) + 24) % 24;
    return Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
  }

  /**
   * Hora local RJ (UTC−3, sem DST) → Date para o relógio Cesium (posição do sol).
   * Evita depender do fuso do browser.
   */
  function dateFromRjLocalHours(hours) {
    const h = ((Number(hours) % 24) + 24) % 24;
    const now = new Date();
    // Calendário “hoje” em UTC−3
    const rjMs = now.getTime() - 3 * 3600 * 1000;
    const rj = new Date(rjMs);
    const y = rj.getUTCFullYear();
    const mo = rj.getUTCMonth();
    const d = rj.getUTCDate();
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ss = Math.floor((((h - hh) * 60) - mm) * 60);
    // RJ local = UTC−3 → UTC = local + 3h
    return new Date(Date.UTC(y, mo, d, hh + 3, mm, ss));
  }

  function ensureNightSkyBox(scene) {
    if (isSkyBoxInstance(scene.skyBox)) return scene.skyBox;
    try {
      if (Cesium.SkyBox && typeof Cesium.SkyBox.createEarthSkyBox === 'function') {
        scene.skyBox = Cesium.SkyBox.createEarthSkyBox();
      } else {
        scene.skyBox = new Cesium.SkyBox({
          sources: {
            positiveX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_px.jpg'),
            negativeX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mx.jpg'),
            positiveY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_py.jpg'),
            negativeY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_my.jpg'),
            positiveZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_pz.jpg'),
            negativeZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mz.jpg')
          }
        });
      }
      return scene.skyBox;
    } catch (_) {
      return null;
    }
  }

  /** Ajusta cor de fundo + atmosfera + estrelas conforme hora / cobertura / vis. */
  function applySkyAppearance(scene, opts) {
    const hours = Number(opts.timeOfDayHours);
    const h = Number.isFinite(hours) ? hours : 12;
    const day = dayFactorFromHours(h);
    const cover = Math.max(0, Math.min(1, Number(opts.cloudCover) || 0));
    const visKm = Math.max(0.4, Math.min(80, Number(opts.visibilityKm) || 20));
    const showSky = opts.showSky !== false;

    // Estrelas (skyBox) só à noite — de dia deixam o céu “preto espacial”
    try {
      if (day < 0.12 && showSky) {
        const box = ensureNightSkyBox(scene);
        if (box) box.show = true;
      } else if (isSkyBoxInstance(scene.skyBox)) {
        scene.skyBox.show = false;
      }
    } catch (_) { /* */ }

    // Fundo opaco diurno (fallback se a atmosfera for fraca com globe:false)
    try {
      let col;
      if (day > 0.55) {
        // Meio-dia: azul claro
        col = new Cesium.Color(0.45 + 0.1 * (1 - cover), 0.68 + 0.08 * (1 - cover), 0.95, 1.0);
      } else if (day > 0.2) {
        // Manhã / tarde
        col = new Cesium.Color(0.35 + 0.2 * day, 0.5 + 0.2 * day, 0.85 + 0.1 * day, 1.0);
      } else if (day > 0.02) {
        // Crepúsculo
        col = new Cesium.Color(0.22, 0.2, 0.42, 1.0);
      } else {
        col = new Cesium.Color(0.03, 0.05, 0.12, 1.0);
      }
      scene.backgroundColor = col;
    } catch (_) { /* */ }

    try {
      if (isSkyAtmosphereInstance(scene.skyAtmosphere)) {
        scene.skyAtmosphere.show = showSky;
        // brightnessShift: −1 = escuro total; valores positivos clareiam o céu diurno
        const haze = cover * 0.12 + (visKm < 8 ? 0.1 : 0);
        scene.skyAtmosphere.brightnessShift = 0.05 + day * 0.42 - haze;
        if (scene.skyAtmosphere.saturationShift != null) {
          scene.skyAtmosphere.saturationShift = day * 0.15 - cover * 0.08;
        }
      }
    } catch (_) { /* */ }

    try {
      if (scene.fog) {
        scene.fog.enabled = visKm < 55;
        scene.fog.density = 0.00002 + (1 / Math.max(visKm, 0.5)) * 0.0014;
        // Evita céu “apagado” pela névoa
        scene.fog.minimumBrightness = 0.35 + day * 0.35;
      }
    } catch (_) { /* */ }

    try {
      if (scene.light && scene.light.intensity != null) {
        scene.light.intensity = 0.5 + day * 1.6;
      }
    } catch (_) { /* */ }
  }

  function setupSkyDefaults() {
    if (!viewer || viewer.isDestroyed()) return;
    const scene = viewer.scene;

    // Céu / sol / lua — com globe:false o show default do SkyAtmosphere fica false
    try {
      if (!isSkyAtmosphereInstance(scene.skyAtmosphere)) {
        scene.skyAtmosphere = new Cesium.SkyAtmosphere();
      }
      scene.skyAtmosphere.show = true;
    } catch (_) { /* */ }

    try {
      if (!scene.sun || typeof scene.sun !== 'object') scene.sun = new Cesium.Sun();
      scene.sun.show = true;
      if (scene.sunBloom != null) scene.sunBloom = true;
    } catch (_) { /* */ }

    try {
      if (!scene.moon || typeof scene.moon !== 'object') scene.moon = new Cesium.Moon();
      scene.moon.show = true;
    } catch (_) { /* */ }

    // Desligar skyBox de estrelas por omissão (recriado só à noite em applySkyAppearance)
    try {
      if (isSkyBoxInstance(scene.skyBox)) scene.skyBox.show = false;
    } catch (_) { /* */ }

    try {
      if (scene.globe) scene.globe.show = false;
      scene.backgroundColor = new Cesium.Color(0.45, 0.68, 0.95, 1.0);
    } catch (_) { /* */ }

    try {
      if (scene.fog) {
        scene.fog.enabled = true;
        scene.fog.density = 0.00006;
        scene.fog.minimumBrightness = 0.55;
      }
    } catch (_) { /* */ }

    try {
      if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) {
        scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
      }
    } catch (_) { /* */ }

    try {
      if (Cesium.SunLight && (!scene.light || !scene.light.direction)) {
        scene.light = new Cesium.SunLight();
      }
      if (scene.light && scene.light.intensity != null) scene.light.intensity = 2.0;
    } catch (_) { /* */ }

    try {
      viewer.clock.shouldAnimate = false;
      viewer.clock.multiplier = 1;
    } catch (_) { /* */ }

    applySkyAppearance(scene, {
      timeOfDayHours: 12,
      visibilityKm: 20,
      cloudCover: 0.35,
      showSky: true
    });

    ensureCloudCollection();
  }

  function ensureCloudCollection() {
    if (!viewer || viewer.isDestroyed()) return null;
    if (cloudCollection && !cloudCollection.isDestroyed && !cloudCollection.isDestroyed()) {
      return cloudCollection;
    }
    if (!Cesium.CloudCollection) return null;
    try {
      cloudCollection = new Cesium.CloudCollection({ noiseDetail: 16.0 });
      viewer.scene.primitives.add(cloudCollection);
      return cloudCollection;
    } catch (e) {
      console.warn('[T-Sim] CloudCollection indisponível:', e);
      cloudCollection = null;
      return null;
    }
  }

  function rebuildClouds(cloudCover) {
    const cc = ensureCloudCollection();
    if (!cc) return;
    try {
      cc.removeAll();
    } catch (_) {
      try {
        while (cc.length > 0) cc.remove(cc.get(0));
      } catch (__) { /* */ }
    }
    const cover = Math.max(0, Math.min(1, Number(cloudCover) || 0));
    if (cover < 0.02) {
      cc.show = false;
      return;
    }
    cc.show = true;
    // Densidade: até ~28 cumulus em anel ao redor da origem RJ
    const n = Math.max(1, Math.round(cover * 28));
    const baseH = 900 + cover * 700;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + cover * 0.7;
      const distM = 2500 + (i % 7) * 900 + (i % 3) * 400;
      const dLat = (Math.cos(ang) * distM) / rio.mPerDegLat;
      const dLon = (Math.sin(ang) * distM) / rio.mPerDegLon;
      const h = baseH + (i % 5) * 180;
      const pos = Cesium.Cartesian3.fromDegrees(
        rio.originLon + dLon,
        rio.originLat + dLat,
        h
      );
      const sx = 18 + (i % 4) * 6 + cover * 10;
      const sy = 8 + (i % 3) * 3 + cover * 4;
      try {
        cc.add({
          show: true,
          position: pos,
          scale: new Cesium.Cartesian2(sx, sy),
          maximumSize: new Cesium.Cartesian3(sx * 0.55, sy * 0.9, sx * 0.45),
          slice: 0.3 + (i % 5) * 0.08,
          brightness: 0.85 - cover * 0.15
        });
      } catch (_) { /* */ }
    }
  }

  /**
   * @param {object} opts
   * @param {number} [opts.timeOfDayHours] 0–24 (hora local do cenário)
   * @param {number} [opts.visibilityKm] 0.5–50
   * @param {number} [opts.cloudCover] 0–1
   * @param {boolean} [opts.showSun]
   * @param {boolean} [opts.showMoon]
   * @param {boolean} [opts.showSky]
   * @param {boolean} [opts.showClouds]
   * @param {Date} [opts.wallDate] se definido, usa data/hora wall-clock (tempo real)
   */
  function applySkyWeather(opts) {
    if (!ready || !viewer || viewer.isDestroyed()) return false;
    opts = opts || {};
    lastSkyOpts = opts;
    const scene = viewer.scene;

    // --- Relógio / sol-lua (hora local RJ UTC−3) ---
    let hoursForAppearance = 12;
    try {
      let date;
      if (opts.wallDate instanceof Date && !isNaN(opts.wallDate.getTime())) {
        date = opts.wallDate;
        // Hora local RJ a partir do wall clock
        hoursForAppearance =
          ((date.getUTCHours() - 3) + 24) % 24 +
          date.getUTCMinutes() / 60 +
          date.getUTCSeconds() / 3600;
      } else {
        const h = Number(opts.timeOfDayHours);
        hoursForAppearance = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 12;
        date = dateFromRjLocalHours(hoursForAppearance);
      }
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
      viewer.clock.shouldAnimate = false;
    } catch (_) { /* */ }

    const showSky = opts.showSky !== false;
    const showSun = opts.showSun !== false;
    const showMoon = opts.showMoon !== false;

    try {
      if (scene.sun && typeof scene.sun === 'object') scene.sun.show = showSun;
      if (scene.moon && typeof scene.moon === 'object') scene.moon.show = showMoon;
    } catch (_) { /* */ }

    // Cor de fundo, atmosfera, estrelas e névoa (céu diurno claro)
    applySkyAppearance(scene, {
      timeOfDayHours: hoursForAppearance,
      visibilityKm: opts.visibilityKm,
      cloudCover: opts.cloudCover,
      showSky: showSky
    });

    // --- Nuvens ---
    try {
      const showClouds = opts.showClouds !== false;
      const cover = Math.max(0, Math.min(1, Number(opts.cloudCover) || 0));
      if (!showClouds || cover < 0.02) {
        const cc = cloudCollection;
        if (cc) {
          try { cc.removeAll(); } catch (_) { /* */ }
          cc.show = false;
        }
      } else {
        rebuildClouds(cover);
      }
    } catch (_) { /* */ }

    try {
      if (scene.requestRender) scene.requestRender();
    } catch (_) { /* */ }
    return true;
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
      // Importante: NÃO passar skyBox/skyAtmosphere como `true` — o CesiumWidget
      // faz `scene.skyAtmosphere = options.skyAtmosphere` e o boolean quebra o render
      // (TypeError: setDynamicLighting is not a function). Omitir = criar defaults.
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
        // Sem skyBox no ctor: o default é o mapa de estrelas (céu escuro de dia).
        // Estrelas só são criadas à noite em applySkyAppearance.
        skyBox: false,
        orderIndependentTranslucency: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        useDefaultRenderLoop: true
      });

      try {
        if (viewer.scene.globe) viewer.scene.globe.show = false;
        if (viewer.imageryLayers) {
          while (viewer.imageryLayers.length > 0) {
            viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
          }
        }
        try {
          const dpr = Math.min(1.5, window.devicePixelRatio || 1);
          viewer.resolutionScale = dpr;
        } catch (_) { /* */ }
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

      setupSkyDefaults();

      // Créditos Cesium/Google: exigidos visíveis pelos ToS — apenas compactados.
      if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
        const cc = viewer.cesiumWidget.creditContainer;
        cc.style.transform = 'scale(0.75)';
        cc.style.transformOrigin = 'bottom left';
        cc.style.opacity = '0.75';
      }

      try {
        tileset = await Cesium.createGooglePhotorealistic3DTileset();
        tileset.maximumScreenSpaceError = 10;
        tileset.dynamicScreenSpaceError = true;
        if (tileset.dynamicScreenSpaceErrorDensity != null) tileset.dynamicScreenSpaceErrorDensity = 2.0e-4;
        if (tileset.dynamicScreenSpaceErrorFactor != null) tileset.dynamicScreenSpaceErrorFactor = 24.0;
        if (tileset.preloadWhenHidden != null) tileset.preloadWhenHidden = false;
        if (tileset.cullWithChildrenBounds != null) tileset.cullWithChildrenBounds = true;
        viewer.scene.primitives.add(tileset);
      } catch (tileErr) {
        console.warn('[T-Sim] Photorealistic 3D Tiles (cenário) falharam:', tileErr);
        destroyViewer();
        return false;
      }

      try {
        const fr0 = viewer.camera.frustum;
        if (fr0) {
          fr0.near = 1.0;
          fr0.far = 120000.0;
        }
      } catch (_) { /* */ }

      ready = true;
      applySkyWeather(lastSkyOpts || {
        timeOfDayHours: 12,
        visibilityKm: 20,
        cloudCover: 0.35,
        showSun: true,
        showMoon: true,
        showSky: true,
        showClouds: true
      });
      console.info('[T-Sim] cenário GE + céu/sol/lua/nuvens ativo');
      return true;
    } catch (err) {
      console.error('[T-Sim] falha ao iniciar cenário Cesium:', err);
      destroyViewer();
      return false;
    }
  }

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

  function syncFromThree(camera, target) {
    if (!ready || !viewer || viewer.isDestroyed() || !camera) return;

    const enuToFixed = ensureEnuMatrix();

    let ex, ey, ez;
    if (camera.matrixWorld && camera.matrixWorld.elements) {
      const e = camera.matrixWorld.elements;
      ex = e[12]; ey = e[13]; ez = e[14];
    } else {
      ex = camera.position.x; ey = camera.position.y; ez = camera.position.z;
    }
    threeToEnu(ex, ey, ez, _enuPos);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuPos, _eye);

    let tx, ty, tz;
    if (target && typeof target.x === 'number') {
      tx = target.x; ty = target.y; tz = target.z;
    } else {
      tx = ex; ty = ey; tz = ez - 200;
    }
    threeToEnu(tx, ty, tz, _enuTarget);
    Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuTarget, _targetEcef);

    Cesium.Matrix4.multiplyByPointAsVector(enuToFixed, _enuUp, _up);
    Cesium.Cartesian3.normalize(_up, _up);

    Cesium.Cartesian3.subtract(_targetEcef, _eye, _dir);
    const dirLen = Cesium.Cartesian3.magnitude(_dir);
    if (dirLen < 1e-3) return;
    Cesium.Cartesian3.divideByScalar(_dir, dirLen, _dir);

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
    try {
      if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
    } catch (_) { /* */ }
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
      if (cloudCollection) {
        try { viewer && viewer.scene.primitives.remove(cloudCollection); } catch (_) { /* */ }
      }
    } catch (_) { /* */ }
    cloudCollection = null;
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
    applySkyWeather,
    resize,
    setActive,
    destroy: destroyViewer
  };
})();
