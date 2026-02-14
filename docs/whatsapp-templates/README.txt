================================================================================
                    WHATSAPP TEMPLATES - OOM WORLD
                    Alternative Time Slot Feature
================================================================================

Ce dossier contient les templates WhatsApp à créer dans Meta Business Suite
pour la fonctionnalité "Proposer un horaire alternatif".

--------------------------------------------------------------------------------
LISTE DES TEMPLATES
--------------------------------------------------------------------------------

1. alternative_slot_offer (FR/EN)
   → Premier message envoyé au client avec la 1ère proposition
   → 2 boutons: Accepter / Autre proposition

2. alternative_slot_offer_2 (FR/EN)
   → Message de suivi si le client refuse la 1ère proposition
   → 2 boutons: Accepter / Non merci

3. alternative_accepted (FR/EN)
   → Confirmation quand le client accepte un créneau
   → Pas de boutons

4. alternative_all_rejected (FR/EN)
   → Message si le client refuse les 2 propositions
   → Pas de boutons

--------------------------------------------------------------------------------
COMMENT CRÉER LES TEMPLATES DANS META BUSINESS SUITE
--------------------------------------------------------------------------------

1. Aller sur business.facebook.com
2. Sélectionner votre compte WhatsApp Business
3. Aller dans "Gestionnaire WhatsApp" > "Modèles de message"
4. Cliquer sur "Créer un modèle"
5. Sélectionner:
   - Catégorie: UTILITY
   - Nom: (voir chaque fichier)
   - Langue: Français (ou English)
6. Copier le contenu de l'en-tête et du corps depuis les fichiers
7. Ajouter les boutons "Réponse rapide" si applicable
8. Soumettre pour approbation (24-48h)

--------------------------------------------------------------------------------
NOTES IMPORTANTES
--------------------------------------------------------------------------------

• Les emojis sont supportés dans WhatsApp Business API
• Le texte entre *astérisques* apparaît en GRAS dans WhatsApp
• Les templates doivent être approuvés par Meta avant utilisation
• Les boutons "Réponse rapide" sont limités à 20 caractères
• Créer d'abord la version FR, puis dupliquer pour EN

--------------------------------------------------------------------------------
FLOW UTILISATEUR
--------------------------------------------------------------------------------

                    ┌─────────────────────────┐
                    │ Coiffeur propose        │
                    │ 2 créneaux alternatifs  │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ Template 1 envoyé       │
                    │ "Proposition d'horaire" │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼                                   ▼
    [✅ Oui, j'accepte]               [🔄 Non, autre proposition]
              │                                   │
              ▼                                   ▼
    ┌─────────────────┐               ┌─────────────────────────┐
    │ Template 3      │               │ Template 2 envoyé       │
    │ "Confirmé" 🎉   │               │ "2ème proposition"      │
    └─────────────────┘               └───────────┬─────────────┘
                                                  │
                                ┌─────────────────┴─────────────────┐
                                │                                   │
                                ▼                                   ▼
                      [✅ Oui, j'accepte]                   [❌ Non merci]
                                │                                   │
                                ▼                                   ▼
                      ┌─────────────────┐               ┌─────────────────┐
                      │ Template 3      │               │ Template 4      │
                      │ "Confirmé" 🎉   │               │ "On recontacte" │
                      └─────────────────┘               └─────────────────┘

================================================================================
