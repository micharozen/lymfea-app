# 🚀 Release Notes — `company-design`

---

## ✂️ Pour les Coiffeurs (PWA)

### 🆕 Créer des réservations directement depuis l'app

Vous pouvez désormais créer une réservation pour un client directement depuis votre application mobile, sans passer par l'admin. Un **nouveau bouton "+"** (bouton doré flottant) apparaît au centre de la barre de navigation.

Le parcours se fait en **4 étapes** :

1. 📋 **Informations client** — Sélectionnez le lieu, renseignez le nom, téléphone (avec sélecteur de code pays international), email et numéro de chambre, puis choisissez la date et l'heure
2. 💇 **Prestations** — Parcourez le menu Femmes/Hommes, ajoutez les prestations souhaitées avec les contrôles de quantité. Le total se met à jour en temps réel
3. ✅ **Récapitulatif** — Vérifiez toutes les infos avant validation
4. 🎉 **Confirmation** — La réservation est créée avec un lien de paiement généré automatiquement

### 🌍 Numéro de téléphone international

Le champ téléphone accepte désormais **tous les indicatifs pays** avec un sélecteur recherchable. Vous pouvez aussi saisir un indicatif personnalisé.

---

## 🛠️ Pour les Admins

### 🏢 Nouveau : Type de lieu "Enterprise"

Un troisième type de lieu est disponible : **Enterprise** (en plus de Hotel et Coworking). Il dispose de sa propre terminologie adaptée :
- 🏷️ Label lieu : "Company"
- 📍 Label espace : "Workspace"
- 💬 Message d'accueil spécifique pour les entreprises
- ✉️ Les emails de confirmation utilisent "Company" au lieu de "Hotel"

### 📑 Nouveau : Dupliquer une prestation

Depuis la liste des prestations, vous pouvez maintenant **dupliquer une prestation existante** en un clic (icône Copier). Cela crée une copie avec tous les paramètres identiques, prête à être modifiée.

### ⭐ Nouveau : Marquer une prestation comme "Bestseller"

Une nouvelle option **"Bestseller"** est disponible lors de la création/édition d'une prestation. Les prestations marquées bestseller apparaissent dans une section dédiée en haut de la page de réservation client (voir section Client ci-dessous).

### ✏️ Nouveau : Sous-titre personnalisable par lieu

Chaque lieu peut désormais avoir un **sous-titre personnalisé** (`landing_subtitle`) qui s'affiche sur la page d'accueil du parcours client. Configurable depuis l'assistant de création/édition de lieu.

### 📊 Amélioration : Analytics — Sessions par lieu

Le dashboard Analytics inclut désormais un **graphique de répartition des sessions par lieu**, permettant de comparer le trafic entre vos différents établissements.

### 🧙 Amélioration : Assistant de création de lieu

L'assistant de création/édition de lieu a été enrichi avec :
- 🔘 Sélection du type de lieu (Hotel / Coworking / Enterprise)
- 📝 Champ sous-titre pour la landing page
- 📐 Meilleure organisation des champs par sections

### 📧 Correction : Emails en production

Les emails de notification (admin, concierge, client) sont désormais envoyés aux **vrais destinataires** — le mode test qui redirigait vers une adresse interne a été supprimé.

### 💱 Correction : Devise dynamique

Les liens de paiement Stripe utilisent désormais la **devise configurée sur le lieu** au lieu de forcer l'EUR. Important pour les lieux hors zone euro.

---

## 📱 Ce qui change pour les Clients (parcours de réservation)

### 🎨 Refonte visuelle complète

Le parcours de réservation client a été entièrement redesigné avec une identité visuelle premium :

**🔤 Nouvelle typographie**
- Introduction de la police **Founders Grotesk** (Light, Regular, Medium) pour un rendu moderne et élégant
- Police serif Kormelink conservée pour les titres

**🏠 Page d'accueil**
- 🎬 **Animation cinématique** : effet zoom-out sur l'image hero au chargement
- ✨ **Animations séquentielles** : le texte et les éléments apparaissent progressivement (reveal, slide-up, fade)
- 🔀 **Deux layouts distincts** selon le type de lieu :
  - 🏨 Hotels : hero plein écran avec animation, titre large, badge sous-titre
  - 🏢 Coworking/Enterprise : layout compact avec logo, descriptions de services
- 📂 Les sections Femmes/Hommes sont désormais **repliées par défaut** (dépliables au clic)
- 🗓️ Pour les lieux Enterprise : affichage de la "Prochaine session" avec date

### ⭐ Nouveau : Section Bestsellers

En haut de la page de sélection des prestations, une **section "Bestsellers"** met en avant jusqu'à 3 prestations phares (2 femmes + 1 homme) dans une grille visuelle avec :
- 🖼️ Images avec badge genre
- 🏷️ Catégorie et durée
- 💰 Prix ou badge "Sur devis"
- ➕ Bouton d'ajout rapide

### 🛒 Nouveau : Panier (Cart Drawer)

Un **tiroir panier** est accessible depuis l'icône sac à provisions présente dans le header de chaque page du parcours :
- 📦 Affiche les articles avec quantités et contrôles +/-
- 🗑️ Bouton supprimer par article
- 💵 Sous-total affiché en bas
- 🔢 Badge doré avec le nombre d'articles sur l'icône

### 📏 Nouveau : Barre de progression

Une **barre de progression** accompagne désormais le client à chaque étape du parcours (Prestations → Horaire → Infos → Paiement).

### 🎭 Animations et transitions

- 👁️ **Scroll-reveal** : les sections apparaissent en fondu lorsqu'elles entrent dans le viewport
- 🎞️ **Stagger animations** : les items de menu apparaissent en cascade (50ms de délai entre chaque)
- 🔄 **Transitions de page** : fondu enchaîné fluide entre les étapes
- ✨ **Effet shimmer doré** : animations subtiles sur certains éléments

### 🌐 Amélioration : Langue automatique

La langue du parcours client est désormais **détectée automatiquement** en fonction de la localisation du lieu :
- 🇫🇷 Lieux en France, Suisse, Belgique, Monaco… : français par défaut
- 🇬🇧 Autres pays : anglais par défaut
- 💾 Le choix est enregistré en session pour ne pas le ré-appliquer

### 💳 Amélioration : Page de paiement

- 📊 Meilleure distinction entre les **articles à prix fixe** et les **articles sur devis**
- 🧮 Affichage clair du total avec mention "+ Sur devis" si applicable
- ⚠️ Bandeau d'avertissement ambre pour les articles nécessitant un devis

### ✅ Amélioration : Page de confirmation

- ⏳ **Icône différenciée** : horloge ambre pour les réservations en attente de devis, check vert pour les confirmées
- 💫 Animation pulsante sur l'icône de succès

---

## ⚙️ Changements techniques notables

- 🗄️ **Migration du bucket Supabase** : les logos email pointent vers le nouveau projet
- 🗃️ **6 migrations de base de données** : nouveau type enterprise, colonnes `landing_subtitle` et `is_bestseller`, RPC mises à jour, politiques RLS pour la création de réservations par les coiffeurs, bucket avatars
- 🌐 **Langue des liens de paiement** changée de FR à EN par défaut
