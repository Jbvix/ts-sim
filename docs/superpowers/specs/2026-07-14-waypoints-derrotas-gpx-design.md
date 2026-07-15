# Design: Waypoints, derrotas e GPX (T‑Sim)

**Data:** 2026-07-14  
**Estado:** implementado (v1)  

## Decisões

| Tema | Escolha |
|------|---------|
| Iniciar reboque | Teleportar comboio (formação actual, vão ~50 m); governo manual |
| Edição | Só no mapa Leaflet |
| Visualização | Waypoints + segmentos também no 3D (Three) |
| GPX | Apenas elementos `<wpt>` |
| Origem ENU | Mantém Rio (`RIO_GEO` −23.05, −43.15) |

## Arquitectura

- Estado: lista numerada `{ id, n, lat, lon, x, z, name }`
- Conversão: `simXZtoLatLng` / `latLngToSim` (1 m = 1 u)
- Leaflet: `L.marker` arrastável + `L.polyline`
- Three: grupo `route3d` (cones + linha)
- Painel flutuante `routePanel` + botão no trilho
- `placeConvoyAt(x,z)` extrai formação de `applyShipPreset`

## Fora de âmbito (v1)

- Autopilot ao longo da derrota
- Arrasto de waypoints na vista 3D
- Importação de `<trkpt>` / `<rtept>`
