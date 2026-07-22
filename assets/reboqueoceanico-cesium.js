/**
 * Costa 3D (Cesium Ion + Google Photorealistic 3D Tiles) — painel de contexto.
 * Não altera a hidrodinâmica Three.js (água, calado, profundidade, cabo).
 *
 * API: window.__simCesiumCoast
 *   .tryInit(rioGeo) → Promise<boolean>
 *   .update(shipLL, tugLL)
 *   .resize()
 *   .setActive(boolean)  — pausa render quando o painel está oculto
 *   .ready
 *   .mode  — 'cesium' | null
 */
(function () {
  'use strict';

  const COMMON = window.__simCesiumCommon;
  const fetchTokenConfig = COMMON.fetchTokenConfig;
  const ensureCesiumBaseUrl = COMMON.ensureCesiumBaseUrl;

  let viewer = null;
  let entityShip = null;
  let entityTug = null;
  let entityTow = null;
  let tileset = null;
  let ready = false;
  let followCam = true;
  let lastCamT = 0;

  async function tryInit(rioGeo) {
    const el = document.getElementById('geo-mapa');
    if (!el || ready) return ready;
    if (typeof Cesium === 'undefined') {
      console.warn('[T-Sim] CesiumJS não carregado — fallback Leaflet');
      return false;
    }

    ensureCesiumBaseUrl();

    let cfg;
    try {
      cfg = await fetchTokenConfig();
    } catch (err) {
      console.warn('[T-Sim] Cesium token indisponível — fallback Leaflet:', err.message || err);
      return false;
    }

    Cesium.Ion.defaultAccessToken = cfg.token;
    if (cfg.googleMapsApiKey) {
      Cesium.GoogleMaps.defaultApiKey = cfg.googleMapsApiKey;
    }

    const originLat = (rioGeo && rioGeo.originLat) || COMMON.RIO_GEO_DEFAULT.originLat;
    const originLon = (rioGeo && rioGeo.originLon) || COMMON.RIO_GEO_DEFAULT.originLon;

    try {
      viewer = new Cesium.Viewer('geo-mapa', {
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
        maximumRenderTimeChange: Infinity
      });

      // Créditos Cesium/Google: exigidos visíveis pelos ToS — apenas compactados.
      if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
        const cc = viewer.cesiumWidget.creditContainer;
        cc.style.fontSize = '9px';
        cc.style.opacity = '0.7';
      }

      try {
        tileset = await Cesium.createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(tileset);
      } catch (tileErr) {
        console.warn('[T-Sim] Photorealistic 3D Tiles falharam:', tileErr);
        destroyViewer();
        return false;
      }

      entityShip = viewer.entities.add({
        id: 'tsim-ship',
        name: 'Navio (rebocado)',
        position: Cesium.Cartesian3.fromDegrees(originLon, originLat, 5),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
          outlineColor: Cesium.Color.fromCssColorString('#075985'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: 'Navio',
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: true
        }
      });

      entityTug = viewer.entities.add({
        id: 'tsim-tug',
        name: 'Rebocador',
        position: Cesium.Cartesian3.fromDegrees(originLon, originLat, 5),
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString('#fca5a5'),
          outlineColor: Cesium.Color.fromCssColorString('#991b1b'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: 'Reb.',
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });

      entityTow = viewer.entities.add({
        id: 'tsim-tow',
        polyline: {
          positions: new Cesium.CallbackProperty(function () {
            const a = entityTug.position.getValue(Cesium.JulianDate.now());
            const b = entityShip.position.getValue(Cesium.JulianDate.now());
            if (!a || !b) return [];
            return [a, b];
          }, false),
          width: 2,
          material: Cesium.Color.fromCssColorString('#7dd3fc').withAlpha(0.9),
          clampToGround: false
        }
      });

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(originLon, originLat, 2800),
        orientation: {
          heading: Cesium.Math.toRadians(20),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        }
      });

      ready = true;
      updateTitle(true);
      wireMinimizePause();
      console.info('[T-Sim] costa 3D Cesium pronta (Photorealistic / Ion)');
      viewer.scene.requestRender();
      return true;
    } catch (err) {
      console.error('[T-Sim] falha ao iniciar Cesium:', err);
      destroyViewer();
      return false;
    }
  }

  function destroyViewer() {
    ready = false;
    try {
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    } catch (_) { /* */ }
    viewer = null;
    entityShip = entityTug = entityTow = tileset = null;
    const el = document.getElementById('geo-mapa');
    if (el) el.innerHTML = '';
  }

  function updateTitle(isCesium) {
    const span = document.getElementById('geo-mapa-title') || document.querySelector('#geo-mapa-header span');
    if (!span) return;
    if (isCesium) {
      span.textContent = 'Rio · GE Cesium (3D)';
      span.title = 'Google Photorealistic 3D Tiles via Cesium Ion. Origem: Baía de Guanabara. Não constitui carta náutica.';
    } else {
      span.textContent = 'Rio · OpenSeaMap';
      span.title = 'OpenStreetMap + OpenSeaMap. Origem: Baía de Guanabara. Não constitui carta náutica.';
    }
  }

  function wireMinimizePause() {
    const minBtn = document.getElementById('geo-mapa-min');
    const body = document.getElementById('geo-mapa-body');
    if (!minBtn || !body || minBtn.dataset.cesiumWired) return;
    minBtn.dataset.cesiumWired = '1';
    minBtn.addEventListener('click', () => {
      setTimeout(() => {
        const on = !body.classList.contains('hidden');
        setActive(on);
        resize();
      }, 50);
    });
  }

  function setActive(on) {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.useDefaultRenderLoop = !!on;
    if (on) viewer.scene.requestRender();
  }

  function update(shipLL, tugLL) {
    if (!ready || !viewer || viewer.isDestroyed()) return;
    if (!shipLL || !tugLL) return;

    const shipPos = Cesium.Cartesian3.fromDegrees(shipLL.lon, shipLL.lat, 8);
    const tugPos = Cesium.Cartesian3.fromDegrees(tugLL.lon, tugLL.lat, 8);
    // ConstantPositionProperty evita avisos ao atualizar a cada frame
    entityShip.position = new Cesium.ConstantPositionProperty(shipPos);
    entityTug.position = new Cesium.ConstantPositionProperty(tugPos);

    const t = performance.now() * 0.001;
    if (followCam && t - lastCamT > 0.4) {
      lastCamT = t;
      const midLon = (shipLL.lon + tugLL.lon) * 0.5;
      const midLat = (shipLL.lat + tugLL.lat) * 0.5;
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(midLon, midLat, 2200),
        orientation: {
          heading: Cesium.Math.toRadians(25),
          pitch: Cesium.Math.toRadians(-42),
          roll: 0
        }
      });
    }
    viewer.scene.requestRender();
  }

  function resize() {
    if (!viewer || viewer.isDestroyed()) return;
    try {
      viewer.resize();
      viewer.scene.requestRender();
    } catch (_) { /* */ }
  }

  window.__simCesiumCoast = {
    get ready() { return ready; },
    get mode() { return ready ? 'cesium' : null; },
    tryInit,
    update,
    resize,
    setActive,
    destroy: destroyViewer
  };
})();
