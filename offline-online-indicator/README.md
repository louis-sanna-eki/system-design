# Online/Offline Indicator System

Une implémentation simple d'un système d'indicateur de présence en ligne/hors ligne utilisant Node.js, Socket.IO et Redis.

## Fonctionnalités

- Indication en temps réel du statut en ligne/hors ligne des utilisateurs
- Affichage "dernière connexion il y a X minutes" pour les utilisateurs hors ligne
- Liste des utilisateurs triée (utilisateurs en ligne en premier)
- Mise à jour instantanée des statuts via WebSocket
- Persistence des statuts avec Redis

## Prérequis

- Docker et Docker Compose
- Un navigateur web moderne

## Installation et démarrage

1. Clonez le repository :
```bash
git clone <repository-url>
cd offline-online-indicator
```

2. Lancez les conteneurs avec Docker Compose :
```bash
docker-compose up --build
```

3. Ouvrez `client/index.html` dans votre navigateur
   - Vous pouvez utiliser un serveur local simple comme `python -m http.server` dans le dossier `client`

## Utilisation

1. Ouvrez plusieurs fenêtres de `index.html`
2. Dans chaque fenêtre :
   - Entrez un ID utilisateur différent
   - Cliquez sur "Connect"
3. Observez les changements de statut en temps réel :
   - Les utilisateurs en ligne apparaissent en vert
   - Les utilisateurs hors ligne apparaissent en rouge avec leur "dernière connexion"
   - La liste est automatiquement triée avec les utilisateurs en ligne en premier

## Architecture

```
                   +-------------+
                   |   Browser   |
                   +-------------+
                          |
                   [WebSocket/HTTP]
                          |
        +----------------+-----------------+
        |         Express + Socket.IO      |
        +----------------+-----------------+
                          |
                   +-------------+
                   |    Redis    |
                   +-------------+
```

## Structure du projet

```
project/
├── docker-compose.yml    # Configuration Docker
├── server/
│   ├── Dockerfile       # Configuration du conteneur serveur
│   ├── package.json     # Dépendances Node.js
│   └── server.js        # Serveur Express + Socket.IO
├── client/
│   └── index.html       # Interface utilisateur
└── README.md
```

## Points techniques

- Le serveur utilise Socket.IO pour les communications en temps réel
- Redis stocke les statuts des utilisateurs et leurs timestamps
- Le système est tolérant aux déconnexions brèves
- Les mises à jour sont propagées à tous les clients connectés

## Développement

Pour développer localement :

1. Installez les dépendances du serveur :
```bash
cd server
npm install
```

2. Lancez Redis séparément :
```bash
docker-compose up redis
```

3. Lancez le serveur en mode développement :
```bash
cd server
npm run dev
```

## Limitations de cette démo

- Pas d'authentification (utilisation simple d'un userId)
- Pas de persistence long terme (uniquement Redis)
- Interface utilisateur minimaliste
- Pas de gestion des erreurs avancée
- Broadcast à tous les utilisateurs (dans une vraie application, on limiterait aux contacts) 