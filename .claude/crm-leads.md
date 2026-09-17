# CRM Twenty — Création de leads

Instance Twenty auto-hébergée sur Railway : **https://crm.saoma.io** (API REST : `/rest`).

Deux chemins d'écriture existent, à ne pas confondre :

| Chemin | Usage |
|---|---|
| MCP `twenty` | Création manuelle depuis Claude (prospection, saisie ponctuelle) |
| `supabase/functions/_shared/twenty-crm.ts` | Formulaires publics de l'app (`support-request`) |

Cette règle couvre le **premier** cas.

## Procédure

Le MCP `twenty` est connecté directement — **inutile de passer par le MCP `railway`** pour récupérer l'URL ou un token. Si `railway` répond `Unauthorized`, ça ne bloque pas la création de lead.

### 1. Vérifier le doublon

Toujours avant de créer :

```
execute_tool("find_many_leads", {
  select: ["id", "name", "email", "companyName", "status"],
  or: [{ name: { ilike: "%<nom>%" } }, { companyName: { ilike: "%<société>%" } }],
  limit: 10
})
```

Les filtres sont des clés **de premier niveau** — ne pas les envelopper dans un objet `filter`.

### 2. Créer

```
execute_tool("create_one_lead", { position: "first", ... })
```

`position` est le **seul champ requis** (`"first"` = en haut de liste).

## Champs

| Champ | Type | Note |
|---|---|---|
| `name` | string | Nom complet |
| `jobTitle` | string | |
| `companyName` | string | Entreprise déclarée, avant conversion |
| `domainName` | `{ primaryLinkUrl, primaryLinkLabel }` | Objet lien, pas une string |
| `email` | `{ primaryEmail, additionalEmails? }` | |
| `phone` | `{ primaryPhoneNumber, primaryPhoneCountryCode?, primaryPhoneCallingCode? }` | |
| `linkedinLink` | `{ primaryLinkUrl, primaryLinkLabel }` | URL encodée si accents (`l%C3%A9onie-...`) |
| `status` | enum | `NEW` `CONTACTED` `QUALIFIED` `UNQUALIFIED` `CONVERTED` |
| `source` | enum | `WEBSITE_FORM` `INBOUND_CALL` `REFERRAL` `EVENT` `LINKEDIN` `COLD_OUTREACH` `OTHER` `RESEAU` `STAYCATION` |
| `rating` | enum | `RATING_1` … `RATING_5` — ne pas inventer, omettre si inconnu |
| `estimatedBudget` | `{ amountMicros, currencyCode }` | **micros** : multiplier le montant par 1 000 000 |
| `message` | string | Contexte libre (voir ci-dessous) |
| `submittedAt` / `lastContactedAt` | ISO 8601 | |

En cas de rejet d'un champ, relire le schéma vivant avec `learn_tools(["create_one_lead"])` plutôt que de deviner : le workspace évolue.

## Conventions

- **Statut** : `CONTACTED` si un mail est déjà parti, sinon `NEW`.
- **Source** : `COLD_OUTREACH` pour la prospection sortante (y compris contacts identifiés via FullEnrich), `RESEAU` pour une intro.
- **Email déduit ≠ email vérifié.** Si l'adresse vient d'un pattern déduit et non d'un enrichissement validé, le dire explicitement dans `message`, avec les adresses qui ont servi à établir le pattern. Ne jamais présenter une adresse déduite comme confirmée.
- **`message`** sert de fiche de contexte : rôle et projet, pourquoi maintenant (timing), historique de contact daté, contacts secondaires sur le même compte, provenance de l'identification.
- Une personne = un lead. Les contacts secondaires du même compte vont dans le `message` du lead principal, sauf si on les démarche séparément.

## Note

Le type `TwentyLeadSource` de `supabase/functions/_shared/twenty-crm.ts` ne liste pas `RESEAU` ni `STAYCATION`, présents dans le workspace. Sans effet sur les formulaires publics (ils n'utilisent pas ces valeurs), mais à savoir si ce type est réutilisé ailleurs.
