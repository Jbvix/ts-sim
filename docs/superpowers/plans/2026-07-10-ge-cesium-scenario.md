# GE Cesium scenario underlay — Implementation Plan

> **For agentic workers:** implement task-by-task. Checkboxes track progress.

**Goal:** Photorealistic coast behind the main Three viewport without changing physics, convoy formation, or 3D camera UX.

**Architecture:** Separate Cesium viewer on `#cesium-scenario` under transparent Three canvas; ENU camera sync via `RIO_GEO`.

**Tech Stack:** CesiumJS 1.125, Three.js (existing), Netlify `/api/cesium-token`

---

### Task 1: `assets/reboqueoceanico-cesium-scenario.js`
- [ ] IIFE `window.__simCesiumScenario` with tryInit / syncFromThree / resize / setActive / destroy

### Task 2: DOM + CSS
- [ ] `#cesium-scenario` in `#sim-container`; stack under `.sim-webgl-canvas`

### Task 3: Three wiring in `reboqueoceanico242TSIM.html`
- [ ] alpha renderer; init scenario; water opacity when ready; sync in `animate`; resize hook
- [ ] Prefer Leaflet inset when scenario Cesium is active

### Task 4: Verify + commit
- [ ] No changes to updatePhysics / initial tug-ship placement / camera modes
- [ ] Commit and push
