# Guide d’audit Coilball — Optimisé pour un quota limité d’Opus 5.5

> **Référence (architecture modulaire ES Modules, P4 + P1 effectuées) :** `game.js` (`271` lignes) + 10 modules dans `src/` (`27 653` lignes, soit `27 924` lignes au total, ~3,6 caractères/token en JS commenté en français).
>
> **Important :** Dans un agent IDE (Antigravity), la consommation réelle inclut la répétition du prompt système (~15–25k tokens) et de tout l’historique déjà lu à chaque tour d’outil, plus les tokens de réflexion (*thinking*) et d’écriture. Grâce au découpage en `src/*.js`, chaque audit cible uniquement les modules concernés, réduisant le coût en tokens de **50 à 75 %**.

---

## 1. Classement et avancement des priorités

| Priorité | Cible | Modules & code brut | Audit seul (ciblé) | Audit + Correctifs + Tests | Statut / Pourquoi Opus 5.5 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P4** | Découpage du monolithe en ES Modules (`src/`) | `game.js` + `src/*.js` (11 fichiers) | — | — | **Effectuée ✅** — Architecture sans bundler ni cycle (`ctx.api` câblé dans `game.js`), enrichie depuis avec `src/nav.js`. |
| **P1 (Critique)** | Synchronisation P2P & machine d’état réseau | `src/net.js` + `src/physics.js` + `src/modes.js` + `src/ultimates.js` | — | — | **Effectuée & déployée en prod ✅** (`C1`, `H1`–`H5`, `M1`–`M6` appliqués et vérifiés sur `https://coilball.vercel.app`). |
| **P2 (Haute)** | Physique, collisions multi-cartes & Ultimates | `src/physics.js` + `src/ultimates.js` *(~20k ciblé)* | **~75k–125k** *(ciblé)* | **~200k–380k** | **Prochaine étape** — Règles multi-contraintes (`clampToField`, `saint-viateur`, ponts, parapets, canopée, vagues d’eau, murs de bois, *tunneling* Dash/Sprint 3x, Règle 1). |
| **P3 (Moyenne)** | Décisionnel de l’IA & routage canopée | `src/ai.js` (`653` lignes, ~7k) + `src/nav.js` *(optionnel)* | **~35k–65k** *(ciblé)* | **~90k–160k** | **À faire** — Blocages d’IA dans les parcs complexes, contournement du triangle Vert > Bleu > Rouge, timing d’Ultimates. |

### Où ne PAS dépenser de quota Opus 5.5
- Retouches UI / HTML / CSS / modales (`index.html`, `style.css`, `src/ui.js` hors logique réseau/jeu).
- Étapes supplémentaires du tutoriel ou options du mode Pratique dans `src/modes.js`.
- Détails visuels / cosmétiques 3D dans `src/render3d.js` ou `src/world.js`.
- Recherche de lignes dans le dépôt ou exécution de builds (`npm.cmd run build` / `dist/`).

---

## 2. Prompts économes prêts à copier-coller (restants)

> **Workflow conseillé en 2 temps :**
> 1. **Tour Opus 5.5** : coller un des prompts ci-dessous pour obtenir uniquement le diagnostic + diffs courts.
> 2. **Tour Modèle léger (Flash / rapide)** : appliquer les diffs validés dans `src/*.js`, synchroniser `dist/` (`npm.cmd run build`) et lancer `node --check` sur les fichiers modifiés.

### Prompt P2 (Prochaine étape) — Physique, Collisions multi-cartes & Ultimates *(~75k–125k tokens)*
```text
Audit ultra-ciblé (n'explore aucun autre fichier, n'édite rien, aucune commande shell).
Lis uniquement :
1) `src/physics.js` L.3044-3290 (`clampToField`)
2) `src/physics.js` L.1748-2080 (`updateGameplay`)
3) `src/physics.js` L.2675-2847 (`checkPlayerCollisions`, `resolveContact`, `freeFromRule1`)
4) `src/ultimates.js` L.466-533 (`triggerPlayerUltimate`), L.877-1076 (`updateFireLasers`), L.1420-1498 (`updateLeafWalls`), L.1909-2025 (`updateWaterWaves`)

Objectif :
- Repère uniquement les failles géométriques/physiques : tunneling (dash / sprint Feuille 3x), coincements entre murs de bois / vagues d'eau / obstacles `saint-viateur` / canopée, et incohérences d'état (Règle 1 + ballon + Ultimate + position `y`/canopée).
- Format strict : fichier + numéro de ligne, scénario exact de blocage ou bug, et diff minimal pour chaque correctif. Zéro refactoring esthétique.
```
*(Options ciblées : ajouter `src/physics.js` `L.1343-1612` pour `stepCharacterVerticalPhysics` si besoin d’analyser le mouvement vertical/saut/glisse, ou `src/world.js` `L.943-1151` pour `hasClearLineOfSight` en cas de doute sur l’occlusion par le décor.)*

---

### Prompt P3 — IA & Routage Canopée *(~35k–65k tokens)*
```text
Audit ultra-ciblé de `src/ai.js` (aucune recherche ailleurs, pas d'édition, pas de shell).
Lis uniquement `src/ai.js` L.298-653 (`updateAIPlayer`), et L.1-297 si les helpers de routage appelés au-dessus nécessitent vérification.

Objectif :
- Identifie les causes de blocage de l'IA autour des obstacles/ponts/canopée, les mauvaises décisions sur le triangle élémentaire (Vert > Bleu > Rouge > Vert) ou l'usage des Ultimates/Dashes.
- Propose max 5 correctifs à fort impact avec diff minimal et lignes exactes.
```
*(Option navigation : si un blocage provient du pathfinding ou des waypoints MOBA/IA, ajouter les plages ciblées de `src/nav.js`.)*

---

## 3. Récapitulatif de l’architecture actuelle (P4 & P1 terminées ✅)

| Fichier | Lignes | Responsabilité |
| :--- | :---: | :--- |
| `game.js` | 271 | Point d’entrée ES Module : bootstrap, câblage `ctx.api`, boucle `animate` |
| `src/state.js` | 672 | Constantes (`COLORS`, `FIELD`), état global (`state`, `mp`, `ctx`) et utilitaires partagés |
| `src/render3d.js` | 2 767 | Scène Three.js, caméra, lumières, textures, entités 3D, particules |
| `src/world.js` | 4 732 | Catalogue cartes, géométrie parcs, `createCanopyTreeNetwork` (`L.2373+`), vision & `hasClearLineOfSight` (`L.943-1151`) |
| `src/nav.js` | 1 121 | Navigation / pathfinding terrain & structures |
| `src/net.js` | 2 312 | Réseau PeerJS / `BroadcastChannel` / WebSocket (`hostRoom`, `joinRoom`, `sendSyncStateToLateJoiner`, `onNetworkMessage`) |
| `src/ultimates.js` | 3 044 | Ultimates Feu / Feuille / Eau (`triggerPlayerUltimate`, `updateFireLasers`, `updateLeafWalls`, `updateWaterWaves`, resync late-join `H5`) |
| `src/ai.js` | 653 | Routage canopée & `updateAIPlayer` |
| `src/physics.js` | 3 290 | `updateGameplay`, sync (`broadcastWorldState`, `applyWorldStateFromHost`), collisions/Règle 1, `finishRound`, `clampToField`, outils (`H5`) |
| `src/modes.js` | 2 325 | Préparation, magasin, tutoriel, pratique (`executePracticeAction`) |
| `src/ui.js` | 6 737 | Modales, entrées (clavier/manette/tactile), vue aérienne MOBA, HUD, minimap |

> **Correctifs P1 déployés en production (`https://coilball.vercel.app`) :**
> `C1` (ciblage `targetPeerId` & déduplication *late-join*), `H1` (protection `ultUsed`/`leafUltTimer` local), `H2` (`netForceSeq` pour poussées/attractions Eau), `H3` (conservation du `roomCode` en restauration), `H4` (reset des compteurs `seq`), `H5` (resync `MP_LATE_ENTITIES` des Ultimates, outils et plaques actives), `M1`–`M6` (ordre carte/seq, timeout WS→PeerJS, `onCanopy` sur Ultimates, suppression du double relais réseau, `reset_powers` par équipe, repli WS→PeerJS hôte).

---

## 4. Points de vigilance restants
- Surveiller la mise à jour des numéros de lignes ci-dessus si `src/physics.js`, `src/ultimates.js` ou `src/ai.js` sont modifiés avant d’exécuter **P2** ou **P3**.
- Après toute application de correctifs P2/P3 : exécuter `npm.cmd run build` + `node --check` sur `dist/game.js` et `dist/src/*.js` avant de déployer.
