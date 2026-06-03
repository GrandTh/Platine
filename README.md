# 🎶 Platine

**Un jukebox collaboratif en temps réel.** Créez une room privée, ajoutez des morceaux YouTube dans une file partagée, votez, et écoutez ensemble — le tout autour d'un vinyle 3D animé.

🌐 **En production : [platine.live](https://platine.live)**

---

## ✨ Fonctionnalités

- **Rooms privées éphémères** — un code court partageable par lien. La room vit tant qu'au moins une personne est présente, puis disparaît.
- **Sans compte** — pas de login. Chaque visiteur a une identité anonyme et une couleur unique.
- **File partagée + votes** — tout le monde ajoute des morceaux et upvote ; la file se réordonne en temps réel.
- **Deux modes d'écoute :**
  - **Même pièce** — seul l'hôte diffuse le son, les invités sont muets (idéal entre potes au même endroit).
  - **Chacun son ordi** — le son est synchronisé sur chaque appareil (à distance).
- **Vote pour passer** — les invités votent pour skip ; à 50 % de la room, le morceau est passé automatiquement.
- **Recherche YouTube** — par mots-clés, par lien vidéo, ou par import de playlist.
- **Vinyle 3D** — disque qui tourne, s'incline vers le curseur, et fait un salto au clic. Fond « liquid metal » teinté par la pochette du morceau.
- **Lecteur intégré** — clip en coin, plein écran, timeline cliquable.
- **Multilingue** — Français et Anglais.

---

## 🛠️ Stack

- **[Nuxt 4](https://nuxt.com)** — framework Vue 3
- **[Vue 3](https://vuejs.org)** — interface réactive
- **[Supabase](https://supabase.com)** — base de données & temps réel
- **[TreeJS](https://tresjs.org)** — 3D / WebGL (Three.js dans Vue)
- **[Nuxt UI](https://ui.nuxt.com)** + **[Tailwind CSS](https://tailwindcss.com)** — composants & styles
- **YouTube** — Data API v3 + IFrame Player API

---

## 🚀 Démarrage

```bash
# installer les dépendances
pnpm install

# lancer le serveur de développement
pnpm dev
```

L'app tourne sur **http://localhost:3000**.
