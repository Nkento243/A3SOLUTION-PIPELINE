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

## Démarrage rapide — Windows (recommandé, sans terminal)

1. Installez [Node.js](https://nodejs.org) (bouton **LTS**) — c'est un
   installeur officiel, signé, qui ne sera jamais bloqué par un antivirus.
   Cette étape ne se fait qu'une seule fois.
2. Téléchargez ce dossier de projet (bouton vert **Code → Download ZIP**
   sur GitHub) et décompressez-le.
3. Double-cliquez sur **`Lancer A3Solution Pipeline.bat`**.

Ce fichier installe les dépendances tout seul au premier lancement (une
fenêtre noire s'affiche brièvement, c'est normal — c'est Node.js qui
travaille, pas un virus), puis ouvre automatiquement votre navigateur sur
l'application. Les lancements suivants sont quasi instantanés.

Les données sont stockées dans `~/.a3solution-pipeline/pipeline.sqlite`
(sur Windows : `C:\Users\<vous>\.a3solution-pipeline\pipeline.sqlite`) et
persistent d'une session à l'autre. Au tout premier démarrage, les 14
dossiers réels du cabinet (Takicorp, Cimencam, CCIF, etc.) sont importés
automatiquement.

> **Pourquoi pas le `.exe` Electron ?** Un exécutable Electron non signé
> (voir plus bas) est régulièrement bloqué par les antivirus grand public
> (Avast, notamment, via CyberCapture) le temps d'une analyse cloud qui
> peut ne jamais aboutir pour un logiciel maison tout juste compilé.
> `node.exe` est un binaire officiel très largement utilisé et signé : ce
> chemin est nettement plus fiable au quotidien.

## Démarrage rapide — macOS / Linux

```bash
npm install
npm start
```

Puis ouvrez **http://localhost:4173** si le navigateur ne s'est pas ouvert
tout seul.

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
contrainte d'`electron-builder`, pas de ce projet. Cet installeur n'étant
pas signé (pas de certificat de signature de code), des antivirus comme
Avast peuvent le bloquer pendant leur analyse cloud (CyberCapture) — voir
le mode navigateur ci-dessus si c'est votre cas.

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
