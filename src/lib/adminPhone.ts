export const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+1", label: "USA", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
];

export const formatPhoneNumber = (value: string, countryCode: string): string => {
  const numbers = value.replace(/\D/g, "");

  switch (countryCode) {
    case "+33": {
      const fr = numbers.slice(0, 10);
      if (fr.length <= 1) return fr;
      if (fr.length <= 3) return `${fr.slice(0, 1)} ${fr.slice(1)}`;
      if (fr.length <= 5) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3)}`;
      if (fr.length <= 7)
        return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5)}`;
      if (fr.length <= 9)
        return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7)}`;
      return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7, 9)} ${fr.slice(9, 10)}`;
    }
    case "+1": {
      const us = numbers.slice(0, 10);
      if (us.length <= 3) return us;
      if (us.length <= 6) return `(${us.slice(0, 3)}) ${us.slice(3)}`;
      return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
    }
    case "+44": {
      const uk = numbers.slice(0, 10);
      if (uk.length <= 4) return uk;
      if (uk.length <= 7) return `${uk.slice(0, 4)} ${uk.slice(4)}`;
      return `${uk.slice(0, 4)} ${uk.slice(4, 7)} ${uk.slice(7)}`;
    }
    case "+39": {
      const it = numbers.slice(0, 10);
      if (it.length <= 3) return it;
      if (it.length <= 6) return `${it.slice(0, 3)} ${it.slice(3)}`;
      return `${it.slice(0, 3)} ${it.slice(3, 6)} ${it.slice(6)}`;
    }
    case "+49": {
      const de = numbers.slice(0, 11);
      if (de.length <= 3) return de;
      return `${de.slice(0, 3)} ${de.slice(3)}`;
    }
    case "+34": {
      const es = numbers.slice(0, 9);
      if (es.length <= 3) return es;
      if (es.length <= 5) return `${es.slice(0, 3)} ${es.slice(3)}`;
      if (es.length <= 7) return `${es.slice(0, 3)} ${es.slice(3, 5)} ${es.slice(5)}`;
      return `${es.slice(0, 3)} ${es.slice(3, 5)} ${es.slice(5, 7)} ${es.slice(7)}`;
    }
    case "+41": {
      const ch = numbers.slice(0, 9);
      if (ch.length <= 2) return ch;
      if (ch.length <= 5) return `${ch.slice(0, 2)} ${ch.slice(2)}`;
      if (ch.length <= 7) return `${ch.slice(0, 2)} ${ch.slice(2, 5)} ${ch.slice(5)}`;
      return `${ch.slice(0, 2)} ${ch.slice(2, 5)} ${ch.slice(5, 7)} ${ch.slice(7)}`;
    }
    case "+32": {
      const be = numbers.slice(0, 9);
      if (be.length <= 3) return be;
      if (be.length <= 5) return `${be.slice(0, 3)} ${be.slice(3)}`;
      if (be.length <= 7) return `${be.slice(0, 3)} ${be.slice(3, 5)} ${be.slice(5)}`;
      return `${be.slice(0, 3)} ${be.slice(3, 5)} ${be.slice(5, 7)} ${be.slice(7)}`;
    }
    case "+971": {
      const ae = numbers.slice(0, 9);
      if (ae.length <= 2) return ae;
      if (ae.length <= 5) return `${ae.slice(0, 2)} ${ae.slice(2)}`;
      if (ae.length <= 9) return `${ae.slice(0, 2)} ${ae.slice(2, 5)} ${ae.slice(5)}`;
      return ae;
    }
    default: {
      const def = numbers.slice(0, 10);
      if (def.length <= 2) return def;
      return def.match(/.{1,2}/g)?.join(" ") || def;
    }
  }
};
