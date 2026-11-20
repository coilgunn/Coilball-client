# Règles Coilball (Vercel)

- **Projet** : `coilball` (scope `coilgunn`, ID `prj_jovy4GT67KqRVhLF3J2HhtesSn0J`) • **Prod** : `https://coilball.vercel.app`.
- **Fichiers publiés** : `index.html`, `style.css`, `game.js`, `src/*.js`, `three.min.js`, `peerjs.min.js` → `dist/` (`npm.cmd run build`).
- **Git / Isolation** : garder `.vercel`, `.env*` et `dist/` dans `.gitignore` (et exclure fichiers internes/doc dans `.vercelignore`).

## Après chaque modification locale (sans déployer)
1. `npm.cmd run build` pour synchroniser `dist/`.
2. Valider localement : `node --check dist/game.js` + cohérence des IDs DOM.
3. Demander confirmation à l’utilisateur : **preview** (`vercel.cmd deploy --yes`), **production** (`vercel.cmd deploy --prod --yes`) ou autres changements.

## Sur demande de déploiement (`vercel.cmd` sous Windows)
1. **Preview** : `vercel.cmd deploy --yes` | **Prod** (sur confirmation explicite) : `vercel.cmd deploy --prod --yes`.
2. Vérifier : statut `READY`, `vercel.cmd curl` → `/` en `HTTP 200` avec `Permissions-Policy: fullscreen=(*)`, et `/GEMINI.md` en `404`.
3. **Réponse finale après succès** : **1 seule ligne** confirmant la mise en ligne vérifiée + l’URL (sans détailler vérifs, IDs ni liens d’inspection, sauf erreur ou demande).

## Délégation des tâches banales / triviales
- Déléguer les tâches banales ou triviales (ex. petits résumés, reformulations simples, vérifications basiques, snippets isolés, tri/formatage simple) à **Nemotron 3 Ultra (free)** via `opencode-models` (`opencode_run` sur `opencode-models_opencode-models` ou sous-agent `opencode-model-runner`) avec le modèle `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`.
- Garder `autoApprove: false` sauf demande explicite de l’utilisateur, et valider la sortie avant de l’appliquer au projet.
