# T‑Sim Melhorias — Plano de Ação

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement **one phase at a time**. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start Phase N+1 until Phase N acceptance criteria pass.

**Goal:** Sequenciar as melhorias da análise (UX → fidelidade pedagógica → consequências operacionais) para o T‑Sim passar de “demo densa” a ferramenta de formação utilizável, sem fingir certificação.

**Architecture:** Quatro fases encadeadas. Cada fase entrega software testável em produção (Netlify) e local (`npm run serve` / `npm run dev`). Física continua em `reboqueoceanico242TSIM.html`; UX em HTML/CSS + `assets/reboqueoceanico-*.js`; redirects em `netlify.toml`. GE/Cesium permanece **visual only** (spec 2026-07-10).

**Tech Stack:** HTML/JS vanilla, Three.js, Leaflet, Cesium (opcional), Netlify redirects/functions, Tailwind (`assets/tw.min.css`).

**Fonte da análise:** canvas `tsim-analise-completa` + `documentos/DOCUMENTACAO_TSIM_REBOQUE.md` §10.5.

## Global Constraints

- Não certificar / não alterar o disclaimer “ilustra conceitos, não certifica”.
- Cesium/GE **não** altera `updatePhysics` / forças do cabo.
- Conventional commits (`feat` / `fix` / `docs` / `chore`); commit + push após cada task que fecha critério de aceitação (regra do repo T‑Sim).
- PT‑BR default na UI; EN só na Fase B se houver tempo.
- Preferir reutilizar `#towHud*` / `TowSafety` em vez de duplicar lógica de tensão.
- Fases C–D mudam física: documentar em `DOCUMENTACAO_TSIM_REBOQUE.md` no mesmo PR.

## Mapa de ficheiros (por responsabilidade)

| Ficheiro | Papel neste plano |
|----------|-------------------|
| `reboqueoceanico242TSIM.html` | Header HUD cabo, checklist, toast GE, flags treino, física heave/BP |
| `assets/reboqueoceanico-242tsim.css` | Chips header, checklist overlay, mobile density |
| `assets/reboqueoceanico-route.js` | Abrir mapa ao abrir Rota; (Fase D) follow leve |
| `assets/reboqueoceanico-float.js` | Layout presets / um float ativo (Fase B) |
| `assets/reboqueoceanico-cesium*.js` | Só toast/fallback status — sem física |
| `netlify.toml` | Redirects `/sim` → HTML |
| `README.md` | Um único “Run local” |
| `documentos/DOCUMENTACAO_TSIM_REBOQUE.md` | Constantes e limitações após mudanças físicas |
| `index.html` | Link `/sim` se aplicável |

## Ordem e esforço estimado

| Fase | Nome | Esforço | Depende de | ROI |
|------|------|---------|------------|-----|
| **A** | UX P0 — descoberta e segurança visível | 3–5 dias | — | Máximo para formação |
| **B** | UX P1 — densidade e fluxos | 4–6 dias | A | Usabilidade diária |
| **C** | Fidelidade pedagógica (cabo + modo treino) | 8–12 dias | A | Transfer de conceito |
| **D** | Propulsão, falhas, derrota | 10–15 dias | C | Credibilidade ops |

```text
A (HUD + checklist + URL) ──► B (mobile/rota/layouts)
         │
         └──► C (heave no cabo + modo treino + drills)
                    │
                    └──► D (BP dinâmico + weak-link + follow derrota)
```

---

## Fase A — UX P0 (fazer primeiro)

**Goal:** Operador vê risco de cabo sem abrir painéis; sabe como arrancar; abre o sim por um URL estável.

**Acceptance (fase completa):**
1. Header mostra tensão kN, %MBL (ou pill estado), dT/dt; pulsa em SURGE.
2. Após splash (1.ª visita), checklist dismissível com 5 passos; `localStorage` respeitado.
3. `/sim` e `/reboqueoceanico242TSIM.html` abrem o mesmo sim na Netlify; README cita só 8080 + `npm run dev`.
4. Sem token Cesium: toast/banner “Sem token Cesium — mapa 2D (OpenSeaMap)”.

### Task A1: Strip de segurança do cabo no header

**Files:**
- Modify: `reboqueoceanico242TSIM.html` (`#sim-header-telemetry`, bloco `TowSafety` que atualiza `#towHud*`)
- Modify: `assets/reboqueoceanico-242tsim.css` (ou estilos inline do header se já lá estiverem)

**Interfaces:**
- Consumes: mesmos valores que alimentam `#towHudT`, `#towHudU`, `#towHudDT`, `#towHudState`, classe `#towHud.surge`
- Produces: `#hdrTowT`, `#hdrTowU`, `#hdrTowDT`, `#hdrTowState` (ou um chip `#hdrTowChip`)

- [ ] **Step 1:** No HTML do header, após o chip Navio, adicionar chip Cabo:

```html
<div class="sim-ht-chip sim-ht-tow" id="hdrTowChip"
     title="Cabo: tensão, util. MBL, dT/dt — mesmos valores do Towline Safety">
  <span class="sim-ht-label">Cabo</span>
  <div class="sim-ht-row">
    <span class="sim-ht-metric"><span id="hdrTowT">0.0</span><span class="sim-ht-unit">kN</span></span>
    <span class="sim-ht-sep" aria-hidden="true">·</span>
    <span class="sim-ht-metric"><span id="hdrTowU">0</span><span class="sim-ht-unit">%MBL</span></span>
    <span class="sim-ht-sep" aria-hidden="true">·</span>
    <span class="sim-ht-metric"><span id="hdrTowDT">0</span><span class="sim-ht-unit">kN/s</span></span>
  </div>
  <span id="hdrTowState" class="sim-ht-pill ok">Seguro</span>
</div>
```

- [ ] **Step 2:** Onde `TowSafety` (ou o loop que escreve `#towHudT`) atualiza o painel, espelhar nos `#hdrTow*` e toggle `hdrTowChip.surge` / classes `ok|warn|danger` iguais a `#towHud`.

- [ ] **Step 3:** CSS: em ≤640px esconder `hdrTowDT` (como `.sim-ht-carga`); manter tensão + %MBL + pill.

- [ ] **Step 4:** Teste manual: abrir Towline, variar scope/Hs até SURGE — header e painel devem coincidir.

- [ ] **Step 5:** Commit `feat: show towline safety strip in sim header`

### Task A2: Checklist de 1.ª utilização

**Files:**
- Modify: `reboqueoceanico242TSIM.html` (splash done handler ~L105; botões `#engineStartStop`, `#asdDriveEngage`)
- Modify: `assets/reboqueoceanico-242tsim.css`

**Interfaces:**
- Consumes: `localStorage` key `tsim.opsChecklist.v1=dismissed`
- Produces: overlay `#ops-checklist` com steps; deep-links que abrem painéis via rail (`data-panel-group`)

- [ ] **Step 1:** Criar overlay dismissível (só se key ausente), após `sim-splash--done`:

```text
1. Partida dos motores  → focar/abrir ASD + highlight #engineStartStop
2. Acoplar transmissão  → #asdDriveEngage
3. Subir RPM ≥ 650
4. Pagar cabo (Guincho) → abrir winch
5. Confirmar Towline / header Cabo
[ Começar ] [ Não mostrar de novo ]
```

- [ ] **Step 2:** “Não mostrar de novo” grava `localStorage`. “Começar” só fecha a sessão.

- [ ] **Step 3:** Teste: hard refresh sem key → aparece; com key → não; mobile: overlay legível acima do rail.

- [ ] **Step 4:** Commit `feat: add first-run ops checklist after splash`

### Task A3: URL estável `/sim` + docs de run único

**Files:**
- Modify: `netlify.toml`
- Modify: `README.md` (secção Desenvolvimento local)
- Modify: `index.html` (CTA Simulador 3D → preferir `/sim` com fallback `.html`)

- [ ] **Step 1:** Em `netlify.toml`:

```toml
[[redirects]]
  from = "/sim"
  to = "/reboqueoceanico242TSIM.html"
  status = 200

[[redirects]]
  from = "/sim/"
  to = "/reboqueoceanico242TSIM.html"
  status = 200
```

- [ ] **Step 2:** README: **uma** tabela “Como correr”:

| Objetivo | Comando | URL |
|----------|---------|-----|
| Rápido (OSM) | `npm run serve` | `http://127.0.0.1:8080/reboqueoceanico242TSIM.html` |
| Completo (GE) | `npm run dev` + `.env` | URL do Netlify Dev |
| Produção | Netlify | `https://<site>/sim` |

Remover qualquer menção a 8765. Nota: `file://` não funciona; extensão `.html` obrigatória no `http.server`.

- [ ] **Step 3:** CTA dashboard aponta para `/sim` (produção) e mantém `.html` como `href` absoluto relativo se necessário para local sem redirects.

- [ ] **Step 4:** Commit `docs: stabilize /sim entry and single local run story`

### Task A4: Toast fallback Cesium → OSM

**Files:**
- Modify: ponto onde o cenário GE falha / token ausente (em `reboqueoceanico242TSIM.html` e/ou `assets/reboqueoceanico-cesium-scenario.js` / common)

- [ ] **Step 1:** Quando init Cesium falhar ou `/api/cesium-token` 4xx/ausente, mostrar banner não bloqueante `#sim-geo-fallback-toast` (aria-live): “Sem token Cesium — a usar OpenSeaMap (2D).”

- [ ] **Step 2:** Não mostrar o toast se GE ativar com sucesso.

- [ ] **Step 3:** Teste: `npm run serve` (sem function) → toast uma vez; `npm run dev` com key → sem toast.

- [ ] **Step 4:** Commit `feat: toast when Cesium falls back to OpenSeaMap`

**Gate Fase A:** checklist acima + push; atualizar canvas de análise (pendências A → completed) opcional.

---

## Fase B — UX P1 (após A)

**Goal:** Menos clutter; fluxo Rota óbvio; painéis didáticos escaneáveis.

### Task B1: Rota abre mapa + modo place

**Files:** `assets/reboqueoceanico-route.js`, rail handler em `reboqueoceanico242TSIM.html`

- [ ] Ao ativar `data-panel-group="route"`, garantir `#geo-mapa-wrap` visível e hint em `#routeStatus`: “Clique no mapa para adicionar waypoint”.
- [ ] Commit `feat: auto-open map when Route panel opens`

### Task B2: Densidade mobile

**Files:** `assets/reboqueoceanico-float.js`, `assets/reboqueoceanico-242tsim.css`

- [ ] ≤640px: no máximo **um** `.sim-float-window` expandido; ao abrir outro, minimizar o anterior.
- [ ] Thruster dock colapsado por defeito no mobile (`.asd-thruster-min`).
- [ ] Labels do rail visíveis sob ícones (reverter `display:none` do `::after` ou texto permanente).
- [ ] Commit `feat: mobile single-float density mode`

### Task B3: Acordeões didáticos

**Files:** painéis `#winchPanel`, `#catenaryGuidePanel` em `reboqueoceanico242TSIM.html`

- [ ] Resumo 2 linhas + `<details>` “Saiba mais” com o texto longo atual.
- [ ] Commit `refactor: collapse long didactic copy behind details`

### Task B4 (opcional): Layout presets

**Files:** `assets/reboqueoceanico-float.js`

- [ ] Botões Bridge | Planning | Teaching que abrem/fecham conjuntos de painéis (só UI, sem física).
- [ ] Commit `feat: add bridge/planning/teaching layout presets`

**Acceptance B:** Rota sem “mapa fechado”; telefone usável com 1 painel; textos longos não dominam o 1.º open.

---

## Fase C — Fidelidade pedagógica

**Goal:** Mar e cabo ensinam o “porquê” do scope; demos deixam de “bater sozinhas” sem o instrutor saber.

> Antes de codificar: escrever spec curta em `docs/superpowers/specs/2026-XX-XX-wave-heave-towline.md` (heave 1‑DOF, o que entra no solver, o que fica cosmético).

### Task C1: Spec heave → cabo

- [ ] Spec: fairleads com heave relativo (mesmo que 1‑DOF spring) alimentam `span` / `S3` em `computeTowlineForces`; remover ou isolar o seno de “tensão extrema” do HUD (§9 docs).
- [ ] Critério: com Hs↑ e scope curto, dT/dt e SURGE sobem **sem** mover RPM.

### Task C2: Implementar heave no path de forças

**Files:** `reboqueoceanico242TSIM.html` (`getAttachmentPointsQuiescent` vs dinâmico; `computeTowlineForces`; `updateVesselMotions`)

- [ ] Introduzir `getAttachmentPointsDynamic()` para o solver; manter quiescent só se necessário para estabilidade numérica (documentar).
- [ ] Rate-limit / EMA existentes (`CABLE_INERTIA`) ajustados, não removidos.
- [ ] Atualizar `DOCUMENTACAO_TSIM_REBOQUE.md` §5 e §9.
- [ ] Commit `feat: couple relative heave into towline span`

### Task C3: Modo treino vs demo

**Files:** `reboqueoceanico242TSIM.html` (`SHIP_TOW_SPEED.resistGlobal`, `computeTowConvoyAssist`)

- [ ] Toggle UI (Ambiente ou Navios): **Demo** (defaults atuais: assist on, resistGlobal≈0.42) vs **Treino** (assist off, resistGlobal=1.0 ou valor documentado).
- [ ] Header pill “Modo: Demo|Treino”.
- [ ] Docs: explicar que Demo é fudge de estabilidade.
- [ ] Commit `feat: expose demo vs training tow balance modes`

### Task C4: Drills scored (MVP)

**Files:** novo `assets/reboqueoceanico-drills.js` + painel leve no HTML

- [ ] 3 drills: (1) manter Hs preset MSC com util MBL &lt; limite X s; (2) scope vs clearance; (3) responder a SURGE (reduzir RPM / pagar cabo) em &lt; N s.
- [ ] Pass/fail + log em painel; sem backend.
- [ ] Commit `feat: add scored towline training drills MVP`

**Acceptance C:** Em modo Treino + Hs alto, snap/SURGE correlaciona com heave; Demo continua estável para apresentações.

---

## Fase D — Propulsão, falhas, derrota

**Goal:** Menos “escoteiro livre” enganador; falha de cabo tem consequência; waypoints servem passagem, não só teleporte.

> Specs separadas obrigatórias antes do código (BP curve; weak-link; route follow).

### Task D1: BP / thrust vs velocidade

- [ ] Substituir ou gate `PROP_N_PER_KW` constante + `clampTugVelocityToRpmSogLimit` por curva “available pull vs SOG” (calm BP → decadência).
- [ ] Recalibrar ponto escoteiro 11 n @ 1300 rpm **ou** documentar como modo separado “Escort free”.
- [ ] Commit `feat: dynamic bollard pull vs speed`

### Task D2: Freio / weak-link

- [ ] FoS modes deixam de ser só labels: payout sob carga com freio; fusível → `TensionN=0` + aviso “perda de reboque”.
- [ ] Commit `feat: winch brake and weak-link tow loss`

### Task D3: Follow de derrota (baixo bandwidth)

- [ ] Spec update ao `2026-07-14-waypoints-derrotas-gpx-design.md`: modo “instructor heading hold toward next WP” (não autopilot completo).
- [ ] Implementar em `reboqueoceanico-route.js` + comando ASD heading.
- [ ] Commit `feat: low-bandwidth route follow toward waypoints`

### Task D4: Pack watchkeeping

- [ ] Trend sparkline de tensão no header ou Towline; checklist ambiental vs preset MSC.
- [ ] Commit `feat: tension trend and env checklist for watchkeeping`

**Acceptance D:** Em Treino, BP cai com velocidade; weak-link parte o reboque; WP seguintes puxam heading sem teleporte contínuo.

---

## Fora de escopo (explícito — não planear agora)

- Certificação STCW / crédito formal
- 6DOF completo / espectro de onda tipo DNV
- COLREG / tráfego / UKC real
- i18n completo (só toggle mínimo se sobrar tempo na B)
- Extrair todo o HTML monolítico para bundler (refactor estrutural)

---

## Como executar este plano

**Opção 1 — Subagent-Driven (recomendado):** um subagente por task (A1→A4), review entre tasks.

**Opção 2 — Inline:** executar Fase A nesta sessão com checkpoints após cada task.

**Opção 3 — Só Fase A agora:** fechar P0 UX; adiar B–D até haver feedback de utilizadores em formação.

---

## Self-review (cobertura da análise)

| Item da análise | Task |
|-----------------|------|
| HUD cabo sempre on | A1 |
| Checklist 1.ª run | A2 |
| URL / run único / 8765 | A3 |
| Toast GE→OSM | A4 |
| Rota abre mapa | B1 |
| Mobile density | B2 |
| Acordeões didáticos | B3 |
| Layout presets | B4 |
| Heave no cabo | C1–C2 |
| Expor convoy-assist / ×0.42 | C3 |
| Drills scored | C4 |
| BP dinâmico | D1 |
| Weak-link / freio | D2 |
| Autopilot / follow derrota | D3 |
| Watchkeeping pack | D4 |

Sem placeholders de implementação nas tasks A; B–D têm critérios e ficheiros — detalhar código ao iniciar cada fase (TDD onde houver `tools/validate_*.py`).
