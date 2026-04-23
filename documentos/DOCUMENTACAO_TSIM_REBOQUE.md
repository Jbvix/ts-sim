# T‑Sim — Reboque oceânico (3D)  
**Documentação técnica, fórmulas e manual do utilizador**

*Este ficheiro vive em `documentos/` no repositório; o simulador e o dashboard permanecem na raiz (`..`).*

**Autoria:** Jossian Brito \* TugLife Systems  

Aplica-se ao simulador **`reboqueoceanico242TSIM.html`** na raiz do projeto (ligação a partir de `index.html`: «Abrir simulador 3D»). O texto abaixo descreve o modelo *tal como implementado* no código; não substitui normas, planos de reboque ou manuais de bordo reais.

---

## 1. Visão geral

O simulador integra:

- **Física 3D** do navio reboque e do rebocador (integração de forças, colisão simplificada).
- **Forças no cabo** (catenária, elasticidade, estados folgado/esticado, arrasto do cabo, teto de tensão) via `window.computeTowlineForces` / `TowSafety.cable`.
- **ASD (azimutal)**: potência a partir de RPM, tração lógica, limite de **BP** à bolina, azimute por propulsor.
- **Carga exibida (%)** *indicador* baseado em tração, calado, **RPM de comando** e SOG, com suavização temporal (EMA).
- **Consumo (l/h)** a partir de **RPM real** dos motores (eixo) e `fuelCurve` com **potência** escalada por `tractionLoad`.
- **Ambiente**: ondas, vento, corrente, profundidade, presets de referência (IMO/MSC, BKI, CCS, etc. onde existirem na UI).

---

## 2. Unidades e conversões (implementação)

| Grandeza     | Unidade no modelo |
|-------------|-------------------|
| Velocidade  | m/s (interno)     |
| Nós         | 1 n = 1,94384 m/s (usado para exibir e em algumas fórmulas) |
| Força       | N                 |
| Potência    | kW                |
| Massa       | kg (exibição reboque: ton) |
| Densidade ar | 1,225 kg/m³ (`RHO_AIR`) |
| Densidade água do mar | 1025 kg/m³ (`RHO_WATER`) |

---

## 3. Comando e intervalo de serviço (RPM)

- **Mínimo de serviço (comando)**: 650 rpm — `TUG_RPM_MIN`  
- **Máximo (comando)**: 1800 rpm — `TUG_RPM_MAX`  
- A **carga (%)** na UI usa o **RPM pedido** nos sliders (comando), não o RPM instantâneo do eixo, para alinhar o indicador ao manípulo quando a máquina ainda sobe ou desce de rotação.  
- O **consumo** e a **física de propulsão** usam, onde indicado, o **RPM real** do motor após a rampa de *spool* (`motorRpm1` / `motorRpm2`).

---

## 4. Curva de potência e força de propulsão

### 4.1 Potência em função do RPM

`getPowerFromRPM(rpm)` interpola **linearmente** a tabela `powerCurve` (pontos rpm → kW). Abaixo de 650 rpm retorna 0; em 1800 rpm e acima retorna `tug.maxPowerKW` (padrão **6000 kW**).

### 4.2 Força de cada propulsor (ordem de grandeza)

\[
F_{\text{kN}} = P_{\text{kW}} \times \text{PROP\_KN\_PER\_KW}
\qquad\qquad
\text{PROP\_KN\_PER\_KW} = 172
\]

A força de cada hélice é depois decomposta pelo **azimute** e posição em relação ao eixo do rebocador. A soma dos módulos é limitada a um **teto de bolina** documentável:

- `BPmaxN = 80 × 9,81 × 1000` N (80 tf) — aplica-se um factor de escala se a soma exceder o limite.

### 4.3 Arrasto no rebocador (modelo)

\[
F_{\text{arr}} = 0,5\,\rho_{\text{água}}\,|\vec v|^2 \cdot 0{,}78 \cdot (\text{vão} \times \text{calado})
\]

O rebocador aplica ainda o factor `TUG_DRAG_TOW_BALANCE = 0,64` sobre essa força (emprego típico em reboque, não geometria 100% em proa).

### 4.4 Resistência do navio reboque (resumo)

A resistência total (casco, hélice aparente, mar) soma três termos interpolados/empíricas e, no fim, multiplica-se por **0,4** (ajuste de equilíbrio do comboio). O vetor aponta contra a velocidade do navio. Detalhe em `calculateTotalShipResistance()`: razão comprimento-velocidade, área de hélice, estado de mar (Beaufort a partir de altura de onda).

### 4.5 Vento e corrente (rebocador e estratégias no navio)

- Vento: `0,5 * RHO_AIR * v_vento² * área_effective` com área e ângulo relativos.  
- Corrente: `0,5 * RHO_WATER * v_corrente² * 0,8 * área_submersa` (simplificação).

---

## 5. Cabo, catenária e forças no reboque

A função `computeTowlineForces(pTug, vTug, pShip, vShip, scope_m, spanFromFairleads)` (com argumento geométrico opcional) calcula:

- Peso em linha do cabo em água: `wNpm` a partir de `wNpm_air` e `buoy_factor`.  
- **Catenária** (`solveCatenary_Symmetric`) para componente horizontal **H** e tensão de extremo **T_end**; com **folga** `L > S` pode entrar mola elástica e flecha.  
- **Atrito no fundo** com trecho `Lb` apoiado, coeficientes `μ_s = 0,6`, `μ_k = 0,5`.  
- **Transição** entre regime folgado (CATENARY), mistura (BLEND) e esticado (TAUT) com *smoothstep* e amortecimento na mola.  
- **Arrasto** no cabo: `0,5 * ρ * Cd * A * V²` com `V` média entre rebocador e navio, repartido 50/50.  
- Retorno: `F_onTug`, `F_onShip`, `TensionN` (com limite a ~MBL do cabo), `H`, `T_end`, `sag`, estado.

Na integração, as forças no cabo sofrem **filtragem (lerp)** com ganho que depende do comprimento pago, para suavizar picos.

---

## 6. `tractionLoad` (0–1) — utilização lógica de tração

Com **transmissão acoplada** (`driveEngaged`):

- Considera a direção de **empuxo** `thrustDir` e a resistência na mesma linha: tensão do cabo, arrasto, vento e corrente oponentes.  
- `potentialThrust` = módulo do empuxo total.  
- `pRunRatio = (res Tow_N × vEff_m/s) / 1000 / pAvailKW` com `pAvailKW = P(RPM1) + P(RPM2)` e `vEff = max(bollMps, |v·thrustDir|)`, onde `bollMps` vem de `tugBollardEqMpsFromAvgRpm` (rampa 0,10 m/s a 650 rpm → 0,48 m/s a 1800 rpm, normalizada).  
- `utilF = min(1, resTowN / potentialThrust)` se houver empuxo.  
- `traction = min(1, max(pRunRatio, utilF))`  
- `tractionLoad = min(1, traction × f_calado)` com:

\[
f_{\text{calado}} = \min\left(1{,}62;\;\max\left(0{,}6;\;\frac{\text{calado (m)}}{5}\right)\right)
\]

Referência de calado no denominador: **5 m** (`TUG_CARGA_DRAFT_REF_M`).

---

## 7. Carga exibida «real» (%) — indicador

Não confundir com **consumo** nem com a única definição legal de carga de motor. É um **índice** para a UI:

\[
P_{\%}^{(\text{unidade})} = 100 \times T_r \times f_{\text{RPM}}(N_{\text{cmd}}) \times w_{\text{SOG}}
\]

- \(T_r =\) `tug.tractionLoad` (já com `f_calado` na origem, ver secção 6).  
- \(f_{\text{RPM}}\) = `tugCargaRpmWeight(cmd)` com **três** troços lineares (valores 0–1, não %):

| RPM de comando | Peso aprox. |
|----------------|------------|
| 650 | 0,16 |
| 900 | 0,40 |
| 1300 | 0,57 (calib. **escoteiro livre** ~**11 n** a ~**1300 rpm** → carga **~54–60 %** com \(T_r \approx 1\)) |
| 1800 | 1,00 |

- \(w_{\text{SOG}}\) combina a influência de **velocidade** e comando:

  - `wSog0 = f_SOG(max(vKn, vKnMinRpm))` — SOG em nós e piso mínimo associado ao RPM de comando;  
    \[
    f_{\text{SOG}}(v) = 0{,}12 + (1-0{,}12)\,\min\!\left(1,\;\frac{v}{\max(0{,}35;\;11{,0})}\right)
    \]  
    (`TUG_CARGA_SOG_REF_KN = 11` n)  
  - `rpmNCmd` = normalização 650–1800;  
  - `wSog = wSog0 + (1 - wSog0) * rpmNCmd` (aumenta a influência de SOG quando o comando sobe).  

**Média** motores gêmeo / dois eixos: o valor global usa média de \(P_{\%}\) para os dois lados, conforme a UI.  
**Suavização visual**: filtro EMA com \(\tau \approx 0{,}38\,\text{s}\) — `TUG_CARGA_DISPLAY_TAU_S`.

**Referência de «100 %»** na documentação de UI: calado 5 m, tração 1, SOG de referência atingido, **1800** rpm de comando, \(f_{\text{RPM}}=1\), \(w_{\text{SOG}}=1\).

### 7.1 Teto de velocidade (SOG) do rebocador

Com motor ao trabalho e embraiagem acoplada, o módulo da velocidade do rebocador é **limitado** por uma rampa de **máx. nós** em função do **RPM de comando** (média dos comandos), não do eixo:

- 650 → **0,58** n  
- 1300 → **11,0** n (experiência de viagem **escoteiro**)  
- 1800 → **12,5** n (teto ligeiramente acima de 11 n)  

Fórmula: dois segmentos lineares, `tugSogCapKnFromRpm(r)`.

Conversão interna: `m/s_max = nós_max / 1,94384`.

---

## 8. Consumo de combustível (l/h)

Para cada motor, com `tractionLoad` como factor de carga lógica na potência *efetiva*:

\[
P_{\text{ef}}^{(i)} = T_r \times P_{\text{i}}(\text{RPM real do eixo } i)
\]

\[
Q_{\text{total}} = Q(P_{\text{ef}}^{(1)}) + Q(P_{\text{ef}}^{(2)})
\]

`Q(kW)` interpola a tabela `fuelCurve` (kW → l/h). Abaixo de motor parado, consumo 0.

---

## 9. Tensão extrema (HUD)

Em mar com onda, a «tensão extrema» adiciona um termo oscilatório simplificado (amplitude crescente com altura de onda e com referência a `towF.TensionN`, atenuado com comprimento de cabo), e suaviza com EMA.

---

## 10. Manual do utilizador

### 10.1 Como abrir

1. Abrir `index.html` na raiz do projeto no browser ou abrir directamente `reboqueoceanico242TSIM.html`.  
2. Garantir que scripts e CDN (Three.js, etc.) carregam (ligação Internet se usar CDN).  

### 10.2 Painéis principais (resumo)

- **Navio e rebocador**: tipo de navio, massa/calado derivados, **velocidade** e **carga (%)** do rebocador, consumo, gráfico de histórico de velocidade.  
- **Rebocador / ASD**: motores, **RPM (650–1800)**, acoplamento, **azimute** por propulsor, modo gêmeo ou independente.  
- **Cabo e reboque**: comprimento pago, tipo de cabo (catálogo / segurança), leitura de **tensão**, **H** catenária, **flecha (sag)**, estado (folgado / misto / esticado).  
- **Ambiente**: ondas, vento, corrente, profundidade, presets (MSC/Circ.884, BKI, CCS, etc. quando disponíveis).  
- **Segurança** (`TowSafety`, quando activo no ecrã): chave de cabo, modos, limites — consultar a própria UI.

### 10.3 Leitura da «carga real» (%) e do consumo

- A **%** acompanha **comando (RPM)**, **SOG**, **tração lógica** (esforço no cabo + calado) e sofre **atraso** de painel.  
- **Não** é apenas mapa de potência: reflete também **reboque** (tração) e **velocidade**.  
- **Viagem escoteiro (referência de calibração)**: com ~**11 n** e **~1300** rpm, esperar da ordem de **54–60 %** com tração e calado perto da unidade.  
- O **consumo (l/h)** depende do **RPM real** do eixo e de `tractionLoad` × curva de potência × `fuelCurve`.

### 10.4 Boas práticas na simulação

- Começar com **cabo pago** e distância compatível com o vão, para evitar registo permanentemente *TAUT* ou tensões no limite.  
- Aumentar **RPM** gradualmente: o modelo **não** salta instantaneamente o RPM do eixo (`MOTOR_RPM_SPOOL_PER_SEC` ≈ 300 rpm/s).  
- Comparar com documentação **MSC/Circ.884** e guias (IMO, CCS) usando os PDFs da pasta; o simulador **ilustra** conceitos, não certifica manobra.

### 10.5 Limitações (importante)

- Modelo numérico simplificado: ordens de grandeza, não substitui ensaios, BP real ou curvas de hélice.  
- Uma embarcação e cabo reais têm histerese, VPP, onda pego-fechado, etc., ausentes ou parcialmente abstraídos.  
- Tectos (BP 80 tf, MBL, SOG) são **parâmetros de software** — podem ser revistos no código.

---

## 11. Tabela de constantes principais (carga / SOG / RPM)

| Símbolo (código) | Valor típico | Notas |
|------------------|-------------|--------|
| `TUG_CARGA_SOG_REF_KN` | 11,0 n | f(SOG) pleno a partir de ~11 n |
| `TUG_SOG_EXPERIENCE_RPM` / `TUG_SOG_EXPERIENCE_SOG_KN` | 1300 rpm / 11 n | ponto teto de rampa (1.º segmento) |
| `TUG_SOG_CAP_KN_AT_RPM_MAX` | 12,5 n | teto a 1800 rpm |
| `TUG_SOG_CAP_KN_AT_RPM_MIN` | 0,58 n | teto a 650 rpm |
| `TUG_CARGA_RPM_ESCORT_RPM` / `TUG_CARGA_RPM_ESCORT_W` | 1300 / 0,57 | calib. carga **escoteiro** |
| `TUG_CARGA_DISPLAY_TAU_S` | 0,38 s | inércia do indicador % |
| `PROP_KN_PER_KW` | 172 | ligação força / potência |
| `TUG_DRAG_TOW_BALANCE` | 0,64 | arrasto rebocador em reboque |

---

## 12. Ficheiro de implementação

Lógica principal, constantes e funções: **`reboqueoceanico242TSIM.html`**. Módulo embebido: início aprox. da secção com `window.computeTowlineForces` e `TowSafety` (IIFE no próprio ficheiro).

---

*Documento: Jossian Brito \* TugLife Systems. Gerado para alinhar o manual à versão com calibração escoteiro (11 n @ 1300 rpm, carga ~54–60 %) e rampe de teto de SOG. Ajuste os valores em código se afinar a calibração.*
