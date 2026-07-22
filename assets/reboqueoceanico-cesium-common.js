/**
 * Utilidades partilhadas dos módulos Cesium do T-Sim (costa 3D + cenário GE).
 * Carregar ANTES de reboqueoceanico-cesium.js e reboqueoceanico-cesium-scenario.js.
 *
 * API: window.__simCesiumCommon
 *   .CESIUM_RELEASE      — versão do CesiumJS usada nos CDNs
 *   .RIO_GEO_DEFAULT     — origem ENU (Rio de Janeiro) partilhada
 *   .fetchTokenConfig()  → Promise<{token, googleMapsApiKey?}>
 *   .ensureCesiumBaseUrl()
 */
(function () {
  'use strict';

  const TOKEN_URLS = ['/api/cesium-token', '/.netlify/functions/cesium-token'];
  const CESIUM_RELEASE = '1.125';

  /**
   * Origem ENU ao largo da costa sul do Rio (Atlântico), ~8–10 km a sul de Copacabana.
   * +X = Leste, +Z = Norte. Comboio em (0,0,*) fica em mar aberto com a costa a norte.
   */
  const RIO_GEO_DEFAULT = {
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

  window.__simCesiumCommon = {
    CESIUM_RELEASE,
    RIO_GEO_DEFAULT,
    fetchTokenConfig,
    ensureCesiumBaseUrl
  };
})();
