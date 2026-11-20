# Guide d’audit Coilball — Optimisé pour un quota limité d’Opus 5.5

> **Référence (architecture modulaire ES Modules, P4 effectuée) :** `game.js` (`402` lignes) + 9 modules dans `src/` (`18 990` lignes, soit `19 392` lignes au total, ~3,6 caractères/token en JS commenté en français).
>
> **Important :** Dans un agent IDE (Antigravity), la consommation réelle inclut la répétition du prompt système (~15–25k tokens) et de tout l’historique déjà lu à chaque tour d’outil, plus les tokens de réflexion (*thinking*) et d’écriture. Grâce au découpage en `src/*.js`, chaque audit cible désormais uniquement les modules concernés, réduisant encore davantage le coût en tokens (**50 à 75 %** d’économie).

---

## 1. Classement des priorités (où Opus 5.5 est le plus rentable)

| Priorité | Cible | Modules & code brut | Audit seul (ciblé) | Audit + Correctifs + Tests | Pourquoi Opus 5.5 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P1 (Critique)** | Synchronisation P2P & machine d’état réseau | `src/net.js` + `src/physics.js` + `src/modes.js` *(~10k ciblé)* | **~40k–75k** *(chirurgical)* / **~110k–180k** *(complet)* | **~220k–400k** | Désynchronisations client/hôte, autorité locale (`maxTolerance`), perte de paquets d’Ultimates, *late-join*, conditions de course PeerJS/`BroadcastChannel`/WebSocket. |
| **P2 (Haute)** | Physique, collisions multi-cartes & Ultimates | `src/physics.js` + `src/ultimates.js` *(~18k ciblé)* | **~75k–125k** *(ciblé)* | **~200k–380k** | Règles multi-contraintes (`clampToField`, `saint-viateur`, ponts, parapets, canopée, vagues d’eau, murs de bois, *tunneling* Dash/Sprint 3x, Règle 1). |
| **P3 (Moyenne)** | Décisionnel de l’IA & routage canopée | `src/ai.js` (`569` lignes, ~6k) | **~35k–60k** *(module entier)* | **~90k–160k** | Blocages d’IA dans les parcs complexes, contournement du triangle Vert > Bleu > Rouge, timing d’Ultimates. |
| **P4 (Effectuée ✅)** | Découpage du monolithe en ES Modules (`src/`) | `game.js` + `src/*.js` (10 fichiers) | **Terminée** | — | Architecture en place sans bundler ni cycle de dépendances (`ctx.api` câblé dans `game.js`). |

### Où ne PAS dépenser de quota Opus 5.5
- Retouches UI / HTML / CSS / modales (`index.html`, `style.css`, `src/ui.js` hors logique réseau/jeu).
- Étapes supplémentaires du tutoriel ou options du mode Pratique dans `src/modes.js`.
- Détails visuels / cosmétiques 3D dans `src/render3d.js` ou `src/world.js`.
- Recherche de lignes dans le dépôt ou exécution de builds (`npm.cmd run build` / `dist/`).

---

## 2. Prompts économes prêts à copier-coller

> **Workflow conseillé en 2 temps :**
> 1. **Tour Opus 5.5** : coller un des prompts ci-dessous pour obtenir uniquement le diagnostic + diffs courts.
> 2. **Tour Modèle léger (Flash / rapide)** : appliquer les diffs validés dans `src/*.js`, synchroniser `dist/` (`npm.cmd run build`) et lancer `node --check` sur les fichiers modifiés.

### Prompt P1 (Chirurgical) — Sync P2P, Ultimates réseau & Fins de ronde *(~40k–75k tokens)*
```text
Audit ultra-ciblé (n'explore aucun autre fichier, ne fais aucune recherche globale, n'édite rien et ne lance aucune commande/build).
Lis uniquement ces 4 plages exactes :
1) `src/modes.js` L.226-316 (`executePracticeAction`)
2) `src/net.js` L.1365-1888 (`sendSyncStateToLateJoiner`, `onNetworkMessage`)
3) `src/physics.js` L.1307-1511 (`broadcastWorldState`, `applyWorldStateFromHost`)
4) `src/physics.js` L.2014-2143 (`finishRound`)

Objectif :
- Liste uniquement les bugs réels de désynchronisation client/hôte, paquets perdus, late-join, autorité locale client (`maxTolerance`), état des Ultimates / Mode Pratique / fins de ronde et conditions de course.
- Pour chaque bug prouvé par le code : sévérité (Critique/Haute/Moyenne), fichier + n° de ligne exact, et patch JS minimal prêt à appliquer (diff court uniquement, pas de réécriture ni de blabla).
```
*(Option connexion/reconnexion : si un bug concerne la création ou la jonction de salon, ajouter `src/net.js` `L.814-1350` pour `hostRoom` et `joinRoom`, soit ~537 lignes en plus.)*

---

### Prompt P2 — Physique, Collisions multi-cartes & Ultimates *(~75k–125k tokens)*
```text
Audit ultra-ciblé (n'explore aucun autre fichier, n'édite rien, aucune commande shell).
Lis uniquement :
1) `src/physics.js` L.2145-2404 (`clampToField`)
2) `src/physics.js` L.1066-1305 (`updateGameplay`)
3) `src/physics.js` L.1809-1976 (`checkPlayerCollisions`, `resolveContact`, `freeFromRule1`)
4) `src/ultimates.js` L.450-511 (`triggerPlayerUltimate`), L.768-942 (`updateFireLasers`), L.1273-1348 (`updateLeafWalls`), L.1732-1846 (`updateWaterWaves`)

Objectif :
- Repère uniquement les failles géométriques/physiques : tunneling (dash / sprint Feuille 3x), coincements entre murs de bois / vagues d'eau / obstacles `saint-viateur` / canopée, et incohérences d'état (Règle 1 + ballon + Ultimate + position `y`/canopée).
- Format strict : fichier + numéro de ligne, scénario exact de blocage ou bug, et diff minimal pour chaque correctif. Zéro refactoring esthétique.
```
*(Option ligne de vue : ajouter `src/world.js` `L.767-955` pour `hasClearLineOfSight` uniquement en cas de doute sur l’occlusion par le décor.)*

---

### Prompt P3 — IA & Routage Canopée *(~35k–60k tokens)*
```text
Audit ultra-ciblé de `src/ai.js` (aucune recherche ailleurs, pas d'édition, pas de shell).
Lis uniquement `src/ai.js` L.252-568 (`updateAIPlayer`), et L.1-251 si les helpers de routage appelés au-dessus nécessitent vérification.

Objectif :
- Identifie les causes de blocage de l'IA autour des obstacles/ponts/canopée, les mauvaises décisions sur le triangle élémentaire (Vert > Bleu > Rouge > Vert) ou l'usage des Ultimates/Dashes.
- Propose max 5 correctifs à fort impact avec diff minimal et lignes exactes.
```

---

### Architecture P4 — Découpage modulaire ES Modules *(Effectué ✅)*
Le monolithe `game.js` a été découpé en **10 fichiers** (sans bundler, compatible hébergement statique et `dist/` via `npm.cmd run build`) :

| Fichier | Lignes | Responsabilité |
| :--- | :---: | :--- |
| `game.js` | 402 | Point d’entrée ES Module : bootstrap, câblage `ctx.api`, boucle `animate` |
| `src/state.js` | 457 | Constantes (`COLORS`, `FIELD`), état global (`state`, `mp`, `ctx`) et utilitaires partagés |
| `src/render3d.js` | 1 629 | Scène Three.js, caméra, lumières, textures, entités 3D, particules |
| `src/world.js` | 3 598 | Catalogue cartes, géométrie parcs, `createCanopyTreeNetwork` (`L.1977-2508`), vision & `hasClearLineOfSight` (`L.767-955`) |
| `src/net.js` | 2 078 | Réseau PeerJS / `BroadcastChannel` / WebSocket (`hostRoom`, `joinRoom`, `sendSyncStateToLateJoiner`, `onNetworkMessage`) |
| `src/ultimates.js` | 2 173 | Ultimates Feu / Feuille / Eau (`triggerPlayerUltimate`, `updateFireLasers`, `updateLeafWalls`, `updateWaterWaves`) |
| `src/ai.js` | 569 | Routage canopée & `updateAIPlayer` |
| `src/physics.js` | 2 404 | `updateGameplay`, sync (`broadcastWorldState`, `applyWorldStateFromHost`), collisions/Règle 1, `finishRound`, `clampToField` |
| `src/modes.js` | 1 869 | Préparation, magasin, tutoriel, pratique (`executePracticeAction`) |
| `src/ui.js` | 4 213 | Modales, entrées (clavier/manette/tactile), vue aérienne MOBA, HUD, minimap |

> **Gestion des dépendances sans cycle :** les imports statiques suivent l’ordre hiérarchique ci-dessus (avec `state.js` à la base et `game.js` au sommet), tandis que les appels transverses ou remontants passent par `ctx.api` câblé au démarrage dans `game.js` (`L.117-170`).

---

## 3. Points de vigilance déjà relevés (pour mémoire)
- Vérifier le cas où la tolérance client (`maxTolerance` `14`/`26` dans `applyWorldStateFromHost`, `src/physics.js` `L.1366-1511`, test à `L.1482`) laisse dériver la position locale lors d’une interception, Règle 1 ou poussée par vague d’eau.
- Vérifier que les Ultimates actifs (`activeLeafWalls`, `activeWaterWaves`, `activeFireLasers`) restent synchronisés en P2P même après perte de paquet ou connexion tardive (`sendSyncStateToLateJoiner`, `src/net.js` `L.1365-1399`).
- Surveiller la mise à jour des numéros de lignes ci-dessus si un module de `src/*.js` est beaucoup modifié avant d’exécuter un audit.
