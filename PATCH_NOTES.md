# Coilball — Patch Notes (Évolution du projet)

> **Période** : `2026-11-12` → `2026-11-21`  
> **Versions** : `v3.0` (prototype) → `v0.18.x` (architecture modulaire, audio, Vercel)

---

## 📋 Tableau récapitulatif des grandes étapes

| Date | Version / Jalonn | Thème principal |
|------|------------------|-----------------|
| 2026-11-12 | v3.0 → v3.2 | Prototype 3D, contrôles de base, fichier autonome Google Sites |
| 2026-11-13 | v3.3 → v3.5 | Multijoueur P2P (PeerJS), cartes MOBA, esthétique Anime/Cel-Shading |
| 2026-11-14 | v3.6 → v3.6.6 | 4 arènes Montréal, optimisations moteur, déploiement Netlify |
| 2026-11-15 | v1.1.0 / v0.9.0 | **Migration P2P → Hybride (WS dédié + fallback)**, Ultimates, Mode Mobile, Serveur Windows Tray |
| 2026-11-16 | v0.10.0 | **Modularisation ES Modules** (10 fichiers), build `esbuild`, dépôt GitHub + Vercel |
| 2026-11-17 | v0.16.0 | Optimisations GPU (Instanced particles), correctif Linux, nouvelle carte **Faille (Rift)** |
| 2026-11-17 | v0.17.0 | Caméra MOBA libre, menu remapping contrôles, UI mobile bottom-sheets |
| 2026-11-18 | v0.17.1 | Hotfix inclinaison caméra MOBA, indicateurs d’ultimes (Eau/Feuille) |
| 2026-11-19 | v0.18.x (SWARM) | Refonte UI menus, pathfinding MOBA, passe à cône, dash jump, marqueurs papier |
| 2026-11-20 | — | Git initialisé, push `main` → Vercel auto, audit mis à jour |
| 2026-11-21 | — | **Système Audio complet** (Web Audio API, spatialisation, bus, ducking) |

---

## 2026-11-12 — v3.0 → v3.2 : Prototype & Contrôles de base
### Gameplay
- Prototype 3D jouable (Three.js) généré depuis Google Slides.
- Mécanique d’**occultation des dossards** (couleurs visibles seulement derrière l’adversaire).
- Règle « Rocket League » : verrouillage mutuel à la 1ʳᵉ collision + Magasin simple (Ronde 3).
- IA basique pour coéquipiers/adversaires.

### Contrôles & Caméra
- **Souris** : guidage permanent de l’angle de vision (Pointer Lock en jeu, libération auto dans les menus).
- **Clavier** : `W`/`S` (avancer/reculer face caméra), `A`/`D` (strafe).
- **Manette** (Gamepad API) : Stick G (déplacement), Stick D (caméra), `LB`/`RB` (changement perso), `B`/`Rond` (Dash), `X`/`Carré` (Parade), `Y`/`Triangle` (Lancer), `Start` (Pause).
- **Dash** : 2,5 s cooldown, interdit si port de ballon.
- **Parade** : `E` / `LT` / `L2` (neutralise dash adverse, projection arrière).
- **Changement de perso** : Clic G/D — ne change plus auto après assises.

### UI/UX
- HUD tactique, panneau phase préparatoire, magasin.
- `Échap` : pause + menu « Reprendre la partie ».
- Plein écran (`F`) + verrouillage curseur (anti-débordement multi-écrans).

### Architecture & Correctifs
- Transitions modales unifiées (`showOnlyModal`).
- Fichier autonome **`coilball_google_sites.html`** (tout-en-un pour `<iframe>` Google Sites).

---

## 2026-11-13 — v3.3 → v3.5 : Multijoueur P2P, Esthétique Anime, Cartes MOBA
### Multijoueur & Réseau (Option A — PeerJS / WebRTC)
- **Salon P2P** : code 4 chiffres, jusqu’à 6 joueurs, hôte autoritaire.
- **Phase préparatoire secrète** : répartition dossards & achats magasin synchronisés via hôte.
- **Exécution** : clients envoient inputs (60 Hz), hôte renvoie état monde (20 Hz) + réconciliation locale.
- **Reconnexion** : `localStorage` code salon + `peer.reconnect()`.
- **Correction rubber-banding** : suppression `lerp` côté client sur perso contrôlé (autorité locale 100 %).

### Cartes & 3D
- **Terrain agrandi** : `76×46` → `120×76` → `156×100` → `210×136` (≈ 28 560 u²).
- **Lanes** : deux couloirs dégagés (`Z = ±36/±50`) devant ballons.
- **Jungle centrale** : obstacles symétriques, buissons furtifs, vision réduite.
- **Verticalité « Arbre-en-arbre »** : ponts suspendus + rampes d’accès unidirectionnelles (glissade sortie).
- **Anti-occlusion caméra** : couronnes surélevées (Y≥16), raycasting ignore `cameraTreeOccluders`.

### Esthétique Anime / Cel-Shading
- Personnages JRPG : tête stylisée, yeux expressifs, cheveux, tenue, **emblèmes dos** (Flamme/Goutte/Feuille).
- Matériaux Toon 3 bandes + contours encre + *rim light*.
- Particules : traînée dash, impact parade, but, apparition pouvoir.

### UI/UX
- **Minimap tactique** : cônes de vision dynamiques (130°), occlusion par décor, étiquettes masquées si hors vue adverse.
- **Widget cooldown Dash** : cercle radial + timer sous le perso.
- **Magasin** : sélection cible explicite + pouvoir **Turbo Dash** (distance +50 %, CD 3 s → 2 s).

### Correctifs & Architecture
- Plein écran Google Sites robuste, garde `pointerlockchange`, nettoyage `openInStandaloneWindowFallback`, colliders rampes.

---

## 2026-11-14 — v3.6 → v3.6.6 : Arènes Montréal, Optimisations, Netlify
### Cartes & 3D — 4 Arènes Montréal
- `lafontaine` (Parc La Fontaine), `saint-viateur` (Parc Saint-Viateur), `jarry` (Parc Jarry), `mont-royal` (Mont-Royal), plus `classic`.
- Sélecteur de carte dans le menu d’accueil.

### Multijoueur & Réseau (Audit profond v3.6.6)
- `MP_START_MATCH` force `state.phase = 'prep'`.
- Mutations atomiques magasin/prêt (`MP_PREP_ACTION`).
- `window.__STANDALONE_BOOT`, nettoyage complet à la déconnexion.

### Optimisations Moteur (`game.js`)
- Cache matériaux, `mergeStaticWorldMeshes()`.
- Broad-phase grille 3D (8 u), cache polygones/raycasting 2D minimap.
- `throttleSend` + delta-compression, `disposeWorldGroup()`.
- Boucle plafonnée 120 FPS.

### Déploiement & Infrastructure
- **Netlify** : `coilball-game.netlify.app`.
- `netlify.toml` (COOP/COEP/CSP).
- GitHub Actions : `verify_coilball.js` (22/22 tests pass).
- `GEMINI.md` créé.

---

## 2026-11-15 — v1.1.0 / v0.9.0 : Hybride WS + PeerJS, Ultimates, Mobile, Serveur Windows
### Multijoueur & Réseau — **Migration P2P → Hybride**
- **Serveur dédié Node.js** (`server/server.js`, `ws`) : `wss://symphonia.tail69ad79.ts.net` (Tailscale Funnel) + fallback PeerJS.
- **Optimisation binaire** : `MP_PLAYER_INPUT` ~63 o, `MP_WORLD_STATE` ~380-422 o via `DataView` (`NetBinWriter`/`NetBinReader`) → **−90 % bande passante**.
- **Admin serveur** : API REST (`/admin/close-room`, `/admin/ban-ip`, `/admin/unban-ip`, `/admin/banned-ips`) + UI, ban IP persistant (`banned-ips.json`).
- **Correction cycle de vie salons** : `resetMatchStateToMenu`.

### Application Serveur Windows (Tray App)
- WinForms PowerShell (`server/tray.ps1`, `server/launcher.ps1`) lancé par `Coilball start server.bat` : dashboard temps réel, icône System Tray, redémarrage auto sur crash.

### Hébergement & Déploiement
- Migration **Netlify → Vercel** (`package.json`, `vercel.json`, `.vercelignore`).
- Prod : `https://coilball.vercel.app`.

### Gameplay — Système d'Ultimates élémentaires
- 1 utilisation/ronde dès la ronde 2 + Tutoriel.
- **Feu** : laser instantané, délai 0,3 s.
- **Feuille** : sprint ×3 (2 s) + mur d’arbres organique (8 s).
- **Eau** : vague repoussante.
- Visée `R` + `Clic Gauche`.

### Cartes & 3D — Différenciation des 4 parcs
- **Saint-Viateur** : île centrale + étang annulaire + 2 ponts.
- **Lafontaine** : étang horizontal + fontaines + pont vertical central.
- **Jarry** : plat, dégagé, gazebo.
- **Mont-Royal** : colline centrale + Croix.
- **Mur Ultimate Feuille** : refonte procédurale (`CatmullRomCurve3` + `TubeGeometry`), version évoluée haute densité bloquant la vision.
- **Occlusion** : transparence (fade) devant la caméra.

### Mode « Pratique »
- Solo sans IA (`1/2/3/Tab`) et P2P sans IA.
- Verrouillage carte en partie, Shop PO illimités (∞) + bouton Reset.

### UI/UX
- **Mode Aérien / MOBA** (`Y`) : caméra surplomb, curseur libre, clic pour déplacer/dash (`Shift`), zoom molette.
- **Tutoriel guidé (4 étapes)** sur carte dédiée 120×80.
- **Pause (Échap)** + assombrissement décor (`DECOR_DARKEN_FACTOR = 0.76`).
- Badge salon actif, compteur de ping temps réel (modale MP + `#pause-ping-badge` in-game, code couleur <60 / 60-130 / >130 ms), toasts réseau.

### Mode Mobile / Écran restreint (v0.9.0)
- Joystick virtuel gauche, zone tactile droite, boutons d’action, caméra TPS par défaut.
- **Terminologie** : `PV` → `pt`/`pts`, `PE` → `pièce d'or` / `🪙 PO`.
- **Tutoriel étendu à 5 étapes** (étape 5 : mode MOBA).
- **Mode Low Spec** (défaut mobile, optionnel PC) : ombres off, `MeshBasicMaterial`, particules /4, résolution ×0,6.
- Empilement CSS mobile (`z-index: 100` sur `.mobile-touch-controls`).

### Évolutions persistantes (Shop)
- 1 évolution par personnage (G/C/D) pour Ultimate, Dash, Action.
- Refonte Shop : suppression pouvoir « Recevoir » (gratuit), conservation lancer + évolutions.

---

## 2026-11-16 — v0.10.0 : Modularisation ES Modules & Git/Vercel
### Architecture — Découpage du monolithe
- `game.js` (18 392 l.) → **10 modules ES acycliques** sans bundler :
  `state.js`, `render3d.js`, `net.js`, `world.js`, `ultimates.js`, `ui.js`, `ai.js`, `modes.js`, `physics.js`, `game.js`.
- Communication montante via `bus` et `ctx.api`.
- Fixes post-split : `ctx.net` initialisé dans `state.js`, 7 imports manquants ajoutés.

### Build & Déploiement
- Migration **`esbuild`** (`game.min.js` ~420 kB gzip).
- Suppression du build monolithique `coilball_google_sites.html`.
- Git initialisé, repo GitHub `coilgunn/Coilball-client` créé, premier commit (`8726bdb`) + push `main`.
- Vercel connecté (auto prod sur `main`, preview sur branches).
- `GEMINI.md` mis à jour (`4c8933f`).

### Multijoueur & Réseau (suite)
- **Vision partagée des dossards (équipe)** : calcul multi-observateurs côté hôte + sync binaire P2P + affichage minimap & roster.

### Gameplay (ajouts v0.9.0)
- **Ultimate Feu** : délai de charge 0,5 s avant tir, visée libre pendant la charge, boule d’énergie visuelle.
- **Ultimate Eau** : opacité accrue, version évoluée couvrant toute la circonférence.
- **Ultimate Feuille** : version évoluée plus dense (noyau feuillu + branches/tronc extérieurs), bloque vision réelle + minimap, durée réduite à 4 s.
- **Dash Glissant** : pose 3D dédiée, inertie conservée (virage ~18°/s), sortie en glissade (0,35 s), FOV kick + lignes de vitesse.
- **Plaques de givre (outils)** : verrouillent la trajectoire à l’entrée (inputs ignorés), glissement tangentiel le long des murs, flèche tapis d’accélération corrigée.

---

## 2026-11-17 — v0.16.0 & v0.17.0 : Architecture & Faille, Caméra Libre & UX MOBA
### Architecture & Correctifs Majeurs (P4 & P1)
- **P4** : Découpage modulaire `src/` finalisé, build `dist/` opérationnel.
- **P1 — Synchronisation P2P / Réseau (12/12 correctifs)** :
  - Ciblage `MP_START_MATCH`/`MP_START_PLAY` par `targetPeerId`.
  - Déduplication `MP_JOIN_REQ` (2,5 s).
  - Protection `ultUsed`/`leafUltTimer` locale.
  - `netForceSeq` binaire pour Ultimate Eau.
  - 3 tentatives reconnexion `roomCode`.
  - `MP_LATE_ENTITIES` (outils, plaques, ultimates actifs).

### Cartes & 3D — Nouvelle Carte **« Faille de l'Invocateur » (`rift`)**
- Arène carrée 176×176 à symétrie centrale, jungle symétrique (4 camps/côté + Dragon & Baron).
- Rivière transversale avec courant directionnel (`getRiverFlowAt`), grande chute d’eau centrale (cascades, brume).
- Sceaux runiques celtiques procéduraux, couloirs dash rebondissants.
- Navigation IA mise à jour (`nav.js`).

### Correctifs Gameplay
- Mobile dash MOBA suit le stick.
- Correction vision dans les buissons.

### Caméra MOBA Libre (style LoL) — v0.17.0
- Point focal découplé (`mobaCamX` / `mobaCamZ`).
- Edge-panning, flèches, clic/glisser minimap, suivi `[F]`, recentrage `Espace` / clic molette.

### Menu Personnalisation Contrôles
- Remapping Clavier / Souris / Gamepad avec détection de conflits.
- Persistance `localStorage`, export/import JSON.

### Épuration Interface Mobile & Curseur Confiné
- Bottom-sheets mobiles, HUD compact.
- Curseur virtuel `#moba-virtual-cursor` confiné via Pointer Lock en MOBA.

### Optimisations GPU & Correctif Linux (17 nov.)
- **Préférence GPU dédiée** (`powerPreference: 'high-performance'`).
- **Particules 100 % GPU** : `InstancedBufferGeometry` + `ShaderMaterial`, 1 seul *draw call* (au lieu de 260 `Mesh`) dans `src/render3d.js`.
- **Correctif Linux (X11/Wayland)** : bug touche `Échap` / menu pause corrigé (garde-fou `keyup` 120 ms, fenêtres de grâce réduites).

---

## 2026-11-18 — v0.17.1 : Hotfix Caméra & Indicateurs d'Ultimes
- Correction inclinaison parasite caméra MOBA (`updateCamera` lerp synchronisé).
- **Ultime Eau (360°)** : indicateur de portée en filigrane (24 rayons + 5 anneaux) + bordure à portée max.
- **Ultime Feuille** : indicateur en flèche + hologramme de mur d’arbres émergent.
- Scintillement MOBA des indicateurs corrigé.

---

## 2026-11-19 — v0.18.x (SWARM) : Refonte Majeure UI, Gameplay, Mobile, Tutoriel
### Interface — Épuration des menus
- Menu Options unique (LowSpec + Contrôles).
- Choix d’arène déplacé *après* la sélection du mode.
- « Multijoueur » remplace « P2P / Serveur ».

### Gameplay — Mécaniques
- **Clic droit = déplacement MOBA** par défaut.
- **Pathfinding MOBA** : recalcul 15 Hz, lissage, évitement dynamique.
- **Passe** : cône de *snap* allié ±15° (PC) / ±30° (mobile) avec filigrane, *free dribble* hors cône.
- **Pouvoir Papier (Marqueurs)** persistants (nettoyés fin de manche).
- **Dash jump** (conservation momentum).
- Remapping : `E` = déployable/passe/relever, `Espace` = saut.
- Marqueur de départ Dash Boomerang.
- Vision LowSpec corrigée.

### Mobile & Tutoriel
- Annulation visée par retour doigt dans bouton.
- Boutons écartés des bords.
- Dual-stick MOBA seul.
- Tutoriel allégé + transition fluide vers Pratique.
- Buissons plus denses avec translucidité et icône feuille HUD.

---

## 2026-11-20 — Maintenance, Audit & Git
- `AUDIT_OPUS.md` mis à jour (P4 ✅, P1 ✅, ancres P2/P3 sur 11 modules).
- Installation Git for Windows (`2.56.1`).
- Commit `d2e8e68` poussé sur `main` → Vercel auto.
- **Outillage** : Plugin global **opencode-models** (pont MCP OpenCode CLI), règle délégation tâches triviales vers **Nemotron 3 Ultra (free)** dans `GEMINI.md`.

---

## 2026-11-21 — Système Audio Complet
### Nouveau module `src/audio.js`
- **Web Audio API** : bus Music / SFX / UI / Voice.
- **Spatialisation 3D** (PannerNode), pool de sources, crossfade, ducking voix.
- **Hooks** intégrés dans `physics.js`, `ultimates.js`, `modes.js`, `ui.js`.
- **Curseurs audio** dans `#options-modal` + persistance `localStorage`.