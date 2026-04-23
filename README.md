# T‑Sim (`ts-sim`)

**TugLife Systems** — Catenária, tração em reboque oceânico e simulador 3D (ASD, cabo, ambiente).

**Autoria:** Jossian Brito · TugLife Systems

Repositório: [github.com/Jbvix/ts-sim](https://github.com/Jbvix/ts-sim)

## Conteúdo

| Ficheiro | Descrição |
|----------|------------|
| `index.html` | Dashboard, calculadora, tabela por velocidade, catenária (PixiJS) |
| `reboqueoceanico242TSIM.html` | Simulador 3D (Three.js) — comboio, cabo, governo |
| `melhores-praticas-imo.html` | Referências IMO/MSC, CCS, BKI (apoio) |
| `DOCUMENTACAO_TSIM_REBOQUE.md` | Fórmulas, constantes, manual (Markdown) |
| `tools/` | Scripts de apoio (ex.: validação) |

## Requisitos

- Navegador moderno; o sim e o dashboard usam **CDN** (Three.js, Tailwind, etc.) — ligação à Internet necessária para o primeiro carregamento.

## Desenvolvimento local

Abrir `index.html` no browser (ou `reboqueoceanico242TSIM.html`).

## Deploy (Netlify)

1. [Netlify](https://app.netlify.com) → *Add new site* → *Import an existing project* → escolher **Jbvix/ts-sim** (GitHub).
2. **Build command:** deixe vazio; o `netlify.toml` define `echo T-Sim static site` (site estático).
3. **Publish directory:** `.` (raiz).
4. *Deploy site* — o site fica em `https://<subdomínio>.netlify.app`.

> PDFs de referência (guías IMO, BKI, USN) estão no repositório; o clone pode ser pesado.

## Licença

MIT — ver ficheiro `LICENSE` no repositório.
