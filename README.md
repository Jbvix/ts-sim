# T‑Sim (ts-sim)

**TugLife Systems** — Catenária, tração em reboque oceânico e simulador 3D (ASD, cabo, ambiente).

- **Jossian Brito** · TugLife Systems

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

1. Ligar o repositório GitHub a **Netlify** → *Add new site* → *Import an existing project* → escolher `Jbvix/ts-sim`.
2. **Build command:** vazio, ou o valor em `netlify.toml` (echo).
3. **Publish directory:** `.` (raiz do repositório).
4. **Domínio:** em *Domain settings* configure o subdomínio `*.netlify.app` ou domínio próprio.

> PDFs de referência (guías IMO, BKI, USN) estão no repositório para consulta; são grandes — clone pode demorar.

## Licença

Ver `LICENSE` (MIT, se presente no remoto) ou a licença do projeto original.
