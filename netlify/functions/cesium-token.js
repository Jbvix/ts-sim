/**
 * Devolve o token Cesium Ion (e opcionalmente a chave Google Maps)
 * a partir das variáveis de ambiente do Netlify — sem expor no git.
 *
 * Env:
 *   CESIUM_API_KEY      — token Ion (obrigatório)
 *   GOOGLE_MAPS_API_KEY — Map Tiles API (opcional; Photorealistic)
 */

function envGet(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      return Netlify.env.get(name);
    }
  } catch (_) { /* */ }
  return process.env[name];
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
      // Sem Access-Control-Allow-Origin: o endpoint é same-origin (o site e a
      // function vivem no mesmo domínio Netlify); CORS aberto exporia o token
      // a qualquer site de terceiros.
    }
  });
}

export default async (req) => {
  if (req.method !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const token = envGet('CESIUM_API_KEY');
  const googleMapsApiKey = envGet('GOOGLE_MAPS_API_KEY') || null;

  if (!token) {
    return json(503, {
      error: 'CESIUM_API_KEY not configured',
      hint: 'Defina CESIUM_API_KEY (token Cesium Ion) no Netlify → Site settings → Environment variables.'
    });
  }

  return json(200, { token, googleMapsApiKey });
};

export const config = {
  path: '/api/cesium-token',
  method: ['GET']
};
