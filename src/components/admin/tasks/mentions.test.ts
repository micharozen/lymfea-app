import { describe, it, expect } from "vitest";
import {
  mentionToken,
  parseMentions,
  collectMentionedUserIds,
  findActiveMention,
  applyMention,
  type MentionTarget,
} from "./mentions";

const MARIE: MentionTarget = {
  user_id: "8f3c1a2b-4d5e-4f60-9a1b-2c3d4e5f6a7b",
  first_name: "Marie",
  last_name: "Dupont",
};
const PAUL: MentionTarget = {
  user_id: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
  first_name: "Paul",
  last_name: "Martin",
};
/** Homonyme partiel : sert à vérifier que le libellé le plus long l'emporte. */
const MARIE_COURT: MentionTarget = {
  user_id: "9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b",
  first_name: "Marie",
  last_name: "",
};

const TEAM = [MARIE, PAUL];

describe("mentionToken", () => {
  it("produit un texte lisible", () => {
    expect(mentionToken(MARIE)).toBe("@Marie Dupont");
  });
});

describe("parseMentions", () => {
  it("rend un texte sans mention en un seul segment", () => {
    expect(parseMentions("Rien à signaler", TEAM)).toEqual([
      { type: "text", value: "Rien à signaler" },
    ]);
  });

  it("rend une chaîne vide sans segment", () => {
    expect(parseMentions("", TEAM)).toEqual([]);
  });

  it("segmente une mention encadrée de texte", () => {
    expect(parseMentions("Peux-tu voir @Marie Dupont avant demain ?", TEAM)).toEqual([
      { type: "text", value: "Peux-tu voir " },
      { type: "mention", value: "Marie Dupont", target: MARIE },
      { type: "text", value: " avant demain ?" },
    ]);
  });

  it("gère une mention en début et en fin de message", () => {
    expect(parseMentions("@Marie Dupont merci @Paul Martin", TEAM)).toEqual([
      { type: "mention", value: "Marie Dupont", target: MARIE },
      { type: "text", value: " merci " },
      { type: "mention", value: "Paul Martin", target: PAUL },
    ]);
  });

  it("laisse en texte un nom qui ne correspond à personne", () => {
    const content = "@Jean Neige a répondu";
    expect(parseMentions(content, TEAM)).toEqual([{ type: "text", value: content }]);
  });

  it("laisse en texte une adresse email", () => {
    const content = "écris à marie@eiaspa.fr";
    expect(parseMentions(content, TEAM)).toEqual([{ type: "text", value: content }]);
  });

  it("retient le libellé le plus long entre deux correspondances", () => {
    const segments = parseMentions("@Marie Dupont ok", [MARIE_COURT, MARIE]);
    expect(segments).toEqual([
      { type: "mention", value: "Marie Dupont", target: MARIE },
      { type: "text", value: " ok" },
    ]);
  });

  it("sans destinataire connu, tout reste du texte", () => {
    expect(parseMentions("@Marie Dupont ok", [])).toEqual([
      { type: "text", value: "@Marie Dupont ok" },
    ]);
  });
});

describe("collectMentionedUserIds", () => {
  it("retourne les ids dans l'ordre, sans doublon", () => {
    const content = "@Marie Dupont et @Paul Martin et encore @Marie Dupont";
    expect(collectMentionedUserIds(content, TEAM)).toEqual([MARIE.user_id, PAUL.user_id]);
  });

  it("retourne un tableau vide sans mention reconnue", () => {
    expect(collectMentionedUserIds("bonjour @marie", TEAM)).toEqual([]);
  });

  it("reconnaît un nom saisi à la main, sans passer par la liste", () => {
    expect(collectMentionedUserIds("merci @Paul Martin", TEAM)).toEqual([PAUL.user_id]);
  });
});

describe("findActiveMention", () => {
  it("détecte une mention en cours de frappe", () => {
    const value = "Coucou @mar";
    expect(findActiveMention(value, value.length)).toEqual({
      query: "mar",
      start: 7,
      end: 11,
    });
  });

  it("détecte un @ isolé en début de message", () => {
    expect(findActiveMention("@", 1)).toEqual({ query: "", start: 0, end: 1 });
  });

  it("ignore un @ collé à un mot (adresse email)", () => {
    const value = "marie@eiaspa";
    expect(findActiveMention(value, value.length)).toBeNull();
  });

  it("ignore une mention déjà close par un espace", () => {
    const value = "Coucou @marie ça va";
    expect(findActiveMention(value, value.length)).toBeNull();
  });

  it("se base sur le curseur, pas sur la fin du texte", () => {
    const value = "Coucou @mar et la suite";
    expect(findActiveMention(value, 11)).toEqual({ query: "mar", start: 7, end: 11 });
  });
});

describe("applyMention", () => {
  it("remplace la saisie par le nom complet et place le curseur après", () => {
    const value = "Coucou @mar";
    const range = findActiveMention(value, value.length)!;
    const result = applyMention(value, range, MARIE);
    expect(result.value).toBe("Coucou @Marie Dupont ");
    expect(result.cursor).toBe(result.value.length);
    expect(collectMentionedUserIds(result.value, TEAM)).toEqual([MARIE.user_id]);
  });

  it("préserve le texte situé après le curseur", () => {
    const value = "Coucou @mar et la suite";
    const range = findActiveMention(value, 11)!;
    expect(applyMention(value, range, MARIE).value).toBe("Coucou @Marie Dupont  et la suite");
  });
});
