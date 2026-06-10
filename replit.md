# Enterprise Chat

Application de messagerie interne d'entreprise — desktop native avec **Tauri 2 + React + Rust + PostgreSQL**.

## Tech Stack

| Couche | Technologie |
|--------|-------------|
| Shell desktop | Tauri 2 |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + variables CSS |
| State | Zustand |
| Routing | React Router v6 |
| Backend natif | Rust (tokio, sqlx, ldap3) |
| Base de données | PostgreSQL |
| Auth | LDAP / Active Directory |

## Architecture

```
/
├── src/                  # Frontend React
│   ├── components/       # Composants réutilisables
│   ├── layouts/          # Layouts de page
│   ├── pages/            # Pages de l'app
│   ├── router/           # React Router config
│   └── store/            # Zustand stores
├── src-tauri/            # Backend Rust
│   ├── src/
│   │   ├── commands/     # Commandes Tauri exposées au frontend
│   │   ├── db/           # Pool PostgreSQL + migrations
│   │   ├── config.rs     # Config TOML
│   │   └── lib.rs        # Point d'entrée Tauri
│   ├── migrations/       # Fichiers SQL de migration
│   ├── capabilities/     # Permissions Tauri
│   └── tauri.conf.json   # Config Tauri
└── public/               # Assets statiques
```

## Fonctionnalités

- **Auth LDAP** : Connexion avec identifiants Active Directory
- **Messagerie** : Chat direct et groupes en temps réel (WebSocket)
- **Groupes** : Création, gestion membres, rôles admin/membre
- **Notifications** : Toast Windows + notifications prioritaires (boîte de dialogue)
- **Admin** : Sync AD, logs, statistiques, gestion utilisateurs
- **Profil** : Infos détaillées, galerie médias style WhatsApp
- **Thème** : Dark/light mode, 5 palettes de couleurs, taille de police, fond de chat personnalisable

## Démarrage développement

```bash
# Frontend uniquement
npm run dev

# App desktop complète (nécessite Rust + dépendances GTK)
npm run tauri dev
```

## Configuration

Au premier lancement, l'application affiche une page de configuration pour :
1. URL PostgreSQL
2. Serveur LDAP (host, port, base DN, attribut utilisateur)

La configuration est stockée dans `$APP_CONFIG_DIR/config.toml`.

## User Preferences

- Langue : Français
- Palette par défaut : WhatsApp vert (#00a884)
- Dark/light mode : Persisté localement par utilisateur
