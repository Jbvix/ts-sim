# GE Photorealistic 3D Tiles no cenário T-Sim — design

**Data:** 2026-07-10  
**Status:** aprovado pelo utilizador (preview `preview-ge-scenario.html`)

## Objetivo

Colocar Google Photorealistic 3D Tiles (via Cesium Ion) como **cenário** do viewport principal. Mudar apenas a geografia visual.

## Não mudar

- Física / hidrodinâmica / cabo / calado / `seabedDepth`
- Formação inicial do comboio (posições navio/rebocador)
- Câmera Three (`PerspectiveCamera` FOV 75, `OrbitControls`, modos free/tug/ship/convoy)
- GLBs, ASD, bóias, UI de propulsão

## Arquitetura (Proposta A)

1. `#cesium-scenario` absolute full-bleed **atrás** do canvas Three (`pointer-events: none`)
2. Three: `WebGLRenderer({ alpha: true })`, `scene.background = null` quando o underlay estiver pronto
3. Água: mesma malha/nível; opacidade reduzida (~0.4) e `depthWrite` false (já existente) para a costa aparecer
4. Sync: após `controls_cam.update()`, mapear eye/target ENU → Cesium (`RIO_GEO`, +X E, +Z N)
5. Inset `#geo-mapa` permanece (OpenSeaMap / GE); se o cenário Cesium subir, preferir OpenSeaMap no inset para evitar dois tilesets Photorealistic

## Fallback

Sem token/Cesium: comportamento atual (fundo `#051d40`, água opacidade 0.8).

## API

`window.__simCesiumScenario`: `tryInit(rioGeo)`, `syncFromThree(cam, target)`, `resize`, `setActive`, `destroy`, `ready`
