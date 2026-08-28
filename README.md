# FNCS Solo Simulator

Simulador de campeonato solo estilo Fortnite (100 jogadores, 12 partidas, pontuação cumulativa por colocação + kills).

## Como rodar

1. Descompacte esta pasta e abra no VS Code.
2. No terminal integrado do VS Code, dentro desta pasta, rode:

```bash
npm install
```

3. Depois rode:

```bash
npm run dev
```

4. Abra o endereço que aparecer no terminal (algo como `http://localhost:5173`).

## Build de produção (opcional)

```bash
npm run build
```

Os arquivos finais ficam na pasta `dist/`, prontos para hospedar em qualquer serviço estático (Vercel, Netlify, GitHub Pages, etc).

## Estrutura

- `src/App.jsx` — todo o simulador (motor de partida, tabelas, pontuação, telas).
- `src/main.jsx` — ponto de entrada que monta o `App` na página.
- `index.html` — HTML base usado pelo Vite.
