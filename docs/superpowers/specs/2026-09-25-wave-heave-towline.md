# Spec: Heave relativo nos fairleads → towline forces

**Data:** 2026-09-25  
**Autor:** Jossian Brito  
**Fase:** C (Fidelidade pedagógica)

## Contexto

O T-Sim calcula o vão 3D (S3) e horizontal (S_hz) entre fairleads usando
`getAttachmentPointsQuiescent()`, que **remove** heave, pitch e roll do mesh
antes de medir as bitas. Isto estabiliza a catenária visual mas **impede**
que o estado de mar (Hs) afecte a tensão dinâmica do cabo — o que contradiz
a experiência real de reboque oceânico.

A "tensão extrema" no HUD é gerada por um **seno sintético** (§9 da docs)
proporcional a Hs, sem correlação com a geometria do cabo. Isto engana o
formando: parece que o mar aumenta tensão, mas a fonte é cosmética.

## Decisão

1. **`getAttachmentPointsDynamic()`** — nova função que lê as bitas
   **com** o heave/pitch/roll actual do mesh (já computado em
   `updateVesselMotions`). Retorna `{ shipAttachPoint, tugAttachPoint }`.

2. **O solver de forças** (`computeTowlineForces`) passa a receber
   `S3` e `S_hz` calculados a partir dos pontos **dinâmicos**.
   Com Hs alto + scope curto, o vão oscila → `dT/dt` sobe →
   SURGE dispara sem o utilizador mexer no RPM.

3. **`getAttachmentPointsQuiescent()`** mantém-se para:
   - `enforceTowlineConstraint()` (restrição de posição — sem heave
     evita drift vertical acumulado).
   - `updateCatenary()` visual (desenho da corda 3D) pode usar
     quiescent ou dinâmico conforme preferência estética.

4. **Seno "tensão extrema"** (HUD §9) — gated: a amplitude do seno
   sintético é reduzida proporcionalmente ao heave real. Quando o heave
   dinâmico é significativo (> 0.3 m de delta-Y), o seno cai a 0.
   Assim a física domina e o HUD é coerente.

5. **EMA / CABLE_INERTIA** — mantidos sem alteração. O rate-limit
   existente suaviza naturalmente os picos de heave.

## Fora de escopo

- 6DOF completo / espectro de onda tipo DNV.
- Heave em frequência de encontro (encounter frequency).
- Acoplamento roll↔sway no cabo (futuro se necessário).

## Modo Demo vs Treino

| Parâmetro | Demo | Treino |
|-----------|------|--------|
| `resistGlobal` | 0.42 | 1.0 |
| `computeTowConvoyAssist` | ON | OFF |
| Seno "tensão extrema" HUD | gated (reduzido) | gated (reduzido) |

Toggle no painel Ambiente ou Navios; pill no header "Modo: Demo | Treino".

## Como testar

1. Abrir sim, Hs = 5 m, scope curto (~150 m), RPM = 1000.
2. Em **Treino**, dT/dt oscila com o mar (período ~6–8 s).
3. Em **Demo**, resist baixo + assist estabilizam o comboio.
4. SURGE dispara com Hs alto + scope curto em ambos os modos.
