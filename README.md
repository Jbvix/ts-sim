# T‑Sim (`ts-sim`)

**TugLife Systems** — Catenária, tração em reboque oceânico e simulador 3D (ASD, cabo, ambiente).

**Autoria:** Jossian Brito · TugLife Systems

Repositório: [github.com/Jbvix/ts-sim](https://github.com/Jbvix/ts-sim)

## Estilos (Tailwind CSS)

O projeto deixou de usar o *Play CDN* (`cdn.tailwindcss.com`). O CSS minificado fica em **`assets/tw.min.css`** (gerado a partir de `src/tailwind-input.css` e `tailwind.config.js`). Se alterar classes Tailwind nos `.html`, regenere:

```bash
npm install
npm run build:css
```

O *deploy* na Netlify executa `npm ci && npm run build:css` (ver `netlify.toml`).

## Conteúdo

| Ficheiro / pasta | Descrição |
|------------------|------------|
| `index.html` | Dashboard, calculadora, tabela por velocidade, catenária (PixiJS) |
| `reboqueoceanico242TSIM.html` | Simulador 3D (Three.js) — comboio, cabo, governo |
| `documentos/melhores-praticas-imo.html` | Referências IMO/MSC, CCS, BKI (apoio) |
| `documentos/DOCUMENTACAO_TSIM_REBOQUE.md` | Fórmulas, constantes, manual (Markdown) |
| `documentos/*.pdf` | PDFs de referência (IMO, BKI, CCS, USN) |
| `tools/` | Scripts de apoio (ex.: validação) |

## Requisitos

- Navegador moderno; o sim e o dashboard usam **CDN** (Three.js, Tailwind, etc.) — ligação à Internet necessária para o primeiro carregamento.

## Desenvolvimento local

`npm install` e `npm run build:css` (uma vez, ou após mudar utilitários Tailwind).

O simulador **não funciona via `file://`** (usa ES modules/import maps) — é preciso servir por HTTP:

- **Rápido (sem cenário GE/Cesium):** `servir-local.bat` / `servir-local.ps1` (ou `npm run serve`) e abrir <http://127.0.0.1:8080/reboqueoceanico242TSIM.html>. Sem a function `/api/cesium-token`, o simulador cai automaticamente no mapa OpenSeaMap/Leaflet.
- **Completo (com cenário GE):** `npm run dev` (Netlify CLI; pede login na 1.ª vez) com um `.env` contendo `CESIUM_API_KEY` (e opcionalmente `GOOGLE_MAPS_API_KEY`) — ver `.env.example`.

Validação do solver de catenária (espelho Python): `python tools/validate_catenary_rest.py` (exit code ≠ 0 em falha).

> **Nota sobre o token Cesium:** em produção, restrinja os domínios permitidos do token no painel Cesium Ion (e da chave no Google Cloud) — o endpoint `/api/cesium-token` é same-origin, mas o token viaja ao browser por natureza.

## Deploy (Netlify)

1. [Netlify](https://app.netlify.com) → *Add new site* → *Import an existing project* → escolher **Jbvix/ts-sim** (GitHub).
2. **Build command:** o `netlify.toml` executa `npm ci && npm run build:css` (Tailwind + `assets/tw.min.css`).
3. **Publish directory:** `.` (raiz).
4. *Deploy site* — o site fica em `https://<subdomínio>.netlify.app`.

> PDFs de referência (guias IMO, BKI, CCS, USN) estão em `documentos/`; o clone pode ser pesado.

## Licença

MIT — ver ficheiro `LICENSE` no repositório.
