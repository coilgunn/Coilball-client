# Guide d’audit Coilball — Optimisé pour un quota limité d’Opus 5.5

> **Référence (architecture modulaire ES Modules, P4 + P1 + P2 + P3 effectuées) :** `game.js` (`276` lignes) + 11 modules dans `src/` (`29 723` lignes, soit `29 999` lignes au total, ~3,6 caractères/token en JS commenté en français), incluant la carte **Faille de l’Invocateur (`rift`)**, `src/nav.js` et `src/audio.js`.
>
> **Important :** Dans un agent IDE (Antigravity), la consommation réelle inclut la répétition du prompt système (~15–25k tokens) et de tout l’historique déjà lu à chaque tour d’outil, plus les tokens de réflexion (*thinking*) et d’écriture. Grâce au découpage en `src/*.js`, chaque audit cible uniquement les modules concernés, réduisant le coût en tokens de **50 à 75 %**.

---

## 1. Classement et avancement des priorités

| Priorité | Cible | Modules & code brut | Statut | Résumé des correctifs appliqués |
| :--- | :--- | :--- | :--- | :--- |
| **P4** | Découpage du monolithe en ES Modules (`src/`) | `game.js` + `src/*.js` (12 fichiers) | **Effectuée ✅** | Architecture sans bundler ni cycle (`ctx.api` câblé dans `game.js`), enrichie avec `src/nav.js` et `src/audio.js`. |
| **P1 (Critique)** | Synchronisation P2P & machine d’état réseau | `src/net.js` + `src/physics.js` + `src/modes.js` + `src/ultimates.js` | **Effectuée & déployée ✅** | `C1`, `H1`–`H5`, `M1`–`M6` (ciblage `targetPeerId`, `netForceSeq`, resync `MP_LATE_ENTITIES`, anti-double-relais, repli WS→PeerJS). |
| **P2 (Haute)** | Physique, collisions multi-cartes (`rift` inclus) & Ultimates | `src/physics.js` + `src/ultimates.js` + `src/world.js` | **Effectuée localement ✅** | Anti-tunneling sous-pas (`stepCharacterVerticalPhysics`), retour Boomerang plafonné, `rayToCapsuleDistance2D` Faille LoL, garde `sitting`/Règle 1, séparation Y canopée/sol sur `hitsGrownLeafWall`/`pushOutFromLeafWalls`/`updateWaterWaves`/`computeFireLaserMaxDist`, re-clamp final dans `clampToField`. |
| **P3 (Moyenne)** | Décisionnel de l’IA & routage (`rift`, Mont-Royal, Canopée) | `src/ai.js` + `src/nav.js` | **Effectuée localement ✅** | Routage au sol par A* (`computeMobaPath`/`hasGridLOS`) remplaçant les hubs fixes `rift`, évitement des `activeToolWalls`, budget A* augmenté sur `rift` (`176×176`), correctifs grille `nav.js` pour Mont-Royal/canopée, ciblage ballon/proie au plus proche et garde `waterShieldTimer`/altitude pour Ultimates IA. |

### Où ne PAS dépenser de quota Opus 5.5
- Retouches UI / HTML / CSS / modales (`index.html`, `style.css`, `src/ui.js` hors logique réseau/jeu).
- Étapes supplémentaires du tutoriel ou options du mode Pratique dans `src/modes.js`.
- Détails visuels / cosmétiques 3D dans `src/render3d.js`, audio dans `src/audio.js` ou décor statique dans `src/world.js`.
- Recherche de lignes dans le dépôt ou exécution de builds (`npm.cmd run build` / `dist/`).

---

## 2. Récapitulatif de l’architecture actuelle (12 fichiers)

| Fichier | Lignes | Responsabilité |
| :--- | :---: | :--- |
| `game.js` | 276 | Point d’entrée ES Module : bootstrap, câblage `ctx.api`, boucle `animate` |
| `src/state.js` | 688 | Constantes (`COLORS`, `FIELD`, `RIFT_FIELD_CONFIG`), état global (`state`, `mp`, `ctx`) et utilitaires partagés |
| `src/audio.js` | 1 079 | Synthèse Web Audio API & effets sonores spatiaux |
| `src/render3d.js` | 2 768 | Scène Three.js, caméra, lumières, textures, entités 3D, particules |
| `src/world.js` | 4 733 | Catalogue cartes (dont `rift` / Faille LoL), géométrie parcs, `createCanopyTreeNetwork`, `getRiftRiverCurrent`, vision & `hasClearLineOfSight` |
| `src/nav.js` | 1 127 | Grille 2D A* (`computeMobaPath`, `hasGridLOS`) + overlay dynamique (`activeToolWalls`, `activeLeafWalls`) + graphe canopée |
| `src/net.js` | 2 313 | Réseau PeerJS / `BroadcastChannel` / WebSocket (`hostRoom`, `joinRoom`, `sendSyncStateToLateJoiner`, `onNetworkMessage`) |
| `src/ultimates.js` | 3 088 | Ultimates Feu / Feuille / Eau (`triggerPlayerUltimate`, `updateFireLasers`, `updateLeafWalls`, `updateWaterWaves`, resync late-join `H5`) |
| `src/ai.js` | 699 | Routage canopée + A* sol (`nav.js`) & `updateAIPlayer` |
| `src/physics.js` | 3 469 | `updateGameplay`, `stepCharacterVerticalPhysics`, sync (`broadcastWorldState`, `applyWorldStateFromHost`), collisions/Règle 1, `finishRound`, `clampToField`, outils (`H5`) |
| `src/modes.js` | 2 914 | Préparation, magasin, tutoriel, pratique (`executePracticeAction`) |
| `src/ui.js` | 6 845 | Modales, entrées (clavier/manette/tactile Wild Rift), vue aérienne MOBA, HUD, minimap (`rift` inclus) |

---

## 3. Détail des correctifs P2 & P3 appliqués (session courante)

### P2 — Physique, Collisions multi-cartes (`rift` inclus) & Ultimates
- **[src/world.js](src/world.js)** (`rayToCapsuleDistance2D`) : lorsque l’origine du rayon est à l’intérieur d’une capsule `JUNGLE_WALLS` (`rift`), retourne `Math.min(minHitDist, maxDist)` au lieu de `maxDist` afin de bloquer le laser Feu et la LOS contre le mur.
- **[src/ultimates.js](src/ultimates.js)** :
  - `computeFireLaserMaxDist` : restreint `onHighCanopy` à `CANOPY_SPEC.hasCanopy && oy >= 3.8` (évite d’ignorer les obstacles du Mont-Royal à `y = 7.6`) et conserve toujours les chutes d’eau (`obs.kind !== 'waterfall'`).
  - `updateFireLasers` : annule et supprime immédiatement le laser en phase `telegraph` si la lanceuse est assise ou cachée.
  - `updateLeafWalls`, `hitsGrownLeafWall`, `pushOutFromLeafWalls` : re-clamp via `clampToField` à la pousse du mur et filtrage vertical (`maxH = 7.5` évolué / `3.85` standard) pour éviter qu’un mur de Feuille au sol bloque la canopée (et inversement).
  - `spawnWaterWaveUltimate`, `updateWaterWaves`, `serializeLateUltimates`, `applyLateUltimates` : sauvegarde `onCanopy` sur la vague, utilise `getStructureSurfaceY` pour `seg.y` et les cibles poussées, passe `seg.y` à `hitsGrownLeafWall` et `airSource` à `clampToField`.
  - `deflectWaveSegmentAroundMapObstacles` : choix de la tangente sur `JUNGLE_WALLS` (`rift`) alignée avec `(dirX, dirZ)` par produit scalaire.
- **[src/physics.js](src/physics.js)** :
  - `triggerBoomerangReturn` : durée `Math.max(0.2, dist / 65)` plafonnant la vitesse de retour.
  - `stepCharacterVerticalPhysics` : intégration horizontale par sous-pas (`<= 0.65 u`, max 8 sous-pas) empêchant le *tunneling* Dash / Sprint Feuille 3x / 4.2x à travers les murs, avec garde `!bouncedThisFrame` sur le Dash Rebondissant.
  - `checkPlayerCollisions` & `resolveContact` : ignore les paires où une joueuse est `'sitting'` et réinitialise proprement physique/sol/charge à l’entrée en `'rule1'`.
  - `clampToField` : utilise `groundY + 3.8` pour la hauteur des obstacles au sol et ré-applique `clampArenaBounds()` avant chaque sortie.

### P3 — IA & Routage (`rift`, Mont-Royal, Canopée)
- **[src/nav.js](src/nav.js)** :
  - `isStaticPointWalkable` : suppression du seuil `yRef >= obsMaxY` sur la grille 2D au sol (Mont-Royal).
  - `isDynamicPointBlocked` & `syncDynamicObstaclesIfDirty` : filtre `!tw.onCanopy` sur `activeToolWalls` (évite d’ignorer les murs sur Mont-Royal) et ignore les `activeLeafWalls` situés en canopée (`y >= 3.8`).
  - `computeMobaPath` : budget `maxExpansions` porté à `9000` (`4500` en `lowSpecMode`) sur `rift` (`176×176`).
- **[src/ai.js](src/ai.js)** :
  - Remplacement des hubs statiques `RIFT_NAV_HUBS` par le routage dynamique au sol via `hasGridLOS` + `computeMobaPath` (cache par joueuse rafraîchi toutes les `0.45 s` ou sur changement de `getNavVersion()` / cible `> 4 u`), avec évitement local des `activeToolWalls` au sol.
  - Filtres d’Ultimates IA (altitude `|Δy| < 2.2`, `waterShieldTimer` pour Feu, LOS pour Eau, proximité cible/ballon pour Feuille), sélection du ballon et de la proie les plus proches (`pickClosestEntity`), et exclusion des prédateurs Feu sous `waterShieldTimer > 0`.

---

## 4. Points de vigilance avant déploiement
- Après toute modification locale : exécuter `npm.cmd run build` + `node --check` sur `dist/game.js` et `dist/src/*.js` + vérification des IDs DOM.
- Demander confirmation explicite avant `git commit` / `git push` (preview vs `main` production) ou `vercel.cmd deploy`.
