# A3Solution Pipeline

CRM pipeline (prospects/clients) du cabinet A3Solution — application locale,
autonome, sans dépendance à claude.ai.

Cette version remplace les deux points d'intégration propres aux Artifacts
Claude (`window.claude.use("db")` et `window.claude.use("sample")`) par :

- une vraie base de données **SQLite locale** (module intégré `node:sqlite`
  de Node.js — aucune compilation native requise), servie par un petit
  serveur **Express** ;
- un appel direct à **l'API Claude (Anthropic)** pour la synthèse
  stratégique, avec une clé API que vous configurez vous-même dans les
  paramètres de l'application (stockée uniquement sur votre ordinateur,
  jamais committée ni envoyée ailleurs).

Le modèle métier (5 étapes du pipeline, KPIs, synthèse graphique, synthèse
stratégique) et la charte graphique A3Solution sont inchangés.

## Démarrage rapide (mode navigateur)

Prérequis : [Node.js](https://nodejs.org) version 22.5 ou supérieure.

```bash
npm install
npm start
```

Puis ouvrez **http://localhost:4173** dans votre navigateur. Les données
sont stockées dans `~/.a3solution-pipeline/pipeline.sqlite` et persistent
d'une session à l'autre.

Au premier démarrage, si aucune base n'existe encore, les 14 dossiers
réels du cabinet (Takicorp, Cimencam, CCIF, etc.) sont importés
automatiquement comme données de départ.

### Créer un raccourci de lancement

- **Windows** : créez un fichier `start.bat` contenant `npm start` dans ce
  dossier, ou un raccourci vers `node server.js`.
- **macOS/Linux** : `npm start` depuis un terminal, ou un script shell
  `.command` / `.sh` qui fait `cd` vers ce dossier puis lance `npm start`.

## Mode application de bureau (Electron)

Pour une expérience « vraie application » (fenêtre dédiée, sans onglet de
navigateur) :

```bash
npm install
npm run electron
```

Cela ouvre l'application dans une fenêtre native, avec le même serveur
local et la même base de données que le mode navigateur.

### Fabriquer un installeur (.exe / .dmg / AppImage)

`electron-builder` est déjà configuré dans `package.json`. Pour produire un
installeur pour votre système :

```bash
npm run dist
```

Le résultat est déposé dans `dist/`. Pour obtenir un installeur Windows
(.exe), lancez cette commande **sur une machine Windows** ; pour un
installeur macOS (.dmg), lancez-la **sur une machine macOS** — c'est une
contrainte d'`electron-builder`, pas de ce projet.

## Configurer la synthèse stratégique (optionnel)

1. Ouvrez l'application, cliquez sur **⚙ Paramètres**.
2. Collez votre clé API Anthropic (obtenue sur [console.anthropic.com](https://console.anthropic.com)).
3. Cliquez sur **Enregistrer**.

Le bouton « Générer la synthèse » apparaît alors dans la section « Synthèse
stratégique ». Sans clé configurée, l'application reste pleinement
utilisable : seule la synthèse stratégique (qui appelle l'API Claude) est
masquée — la synthèse graphique (donut + barres), calculée localement,
reste toujours disponible.

Chaque génération de synthèse consomme des crédits sur votre compte
Anthropic (facturation à l'usage, hors abonnement Claude.ai).

## Sauvegarder / migrer vos données

Toute la base est un unique fichier :

```
~/.a3solution-pipeline/pipeline.sqlite
```

Copiez ce fichier pour le sauvegarder, ou pour le transférer sur un autre
ordinateur (recopiez-le au même emplacement après avoir installé
l'application).

## Structure du projet

```
server.js               Serveur Express + SQLite (API REST) + proxy Anthropic
public/
  index.html             Page unique (UI)
  styles.css             Charte graphique A3Solution (inchangée)
  app.js                 Logique métier (pipeline, KPIs, synthèses)
seed/
  a3solution-pipeline-data.json   Les 14 dossiers réels importés au 1er démarrage
electron/
  main.js                Point d'entrée de la version bureau (Electron)
```
