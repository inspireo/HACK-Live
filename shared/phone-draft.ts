import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import metadata from "libphonenumber-js/metadata.min.json";
import { normalizeContactPhone } from "./profile";

// UI-only state. Country choice is never persisted or inferred from locale.
export type PhoneDraft = { country: string; national: string; international?: true };
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const phoneCountries = getCountries().map(country => ({ country, code: getCountryCallingCode(country), name: regionNames.of(country) || country })).sort((left, right) => left.name.localeCompare(right.name));
const callingRegions = metadata.country_calling_codes as Record<string, string[]>;
export const neutralCallingCodes = Object.entries(callingRegions).filter(([, regions]) => regions.length !== 1 || regions[0] === "001").map(([code, regions]) => ({ code, label: regions[0] === "001" ? "non-geographic calling code" : "shared calling code" }));

export function hydratePhone(value = ""): PhoneDraft {
  const compact = value.trim().replace(/[ ()-]/g, "");
  if (/^\+\d+$/.test(compact)) {
    const code = Object.keys(callingRegions).find(candidate => compact.slice(1).startsWith(candidate));
    if (code) {
      const regions = callingRegions[code];
      return { country: regions.length === 1 && regions[0] !== "001" ? regions[0] : `+${code}`, national: compact.slice(code.length + 1), international: true };
    }
  }
  return { country: "", national: value };
}

export function editPhone(draft: PhoneDraft, value: string): PhoneDraft {
  return value.trim().startsWith("+") ? hydratePhone(value) : { country: draft.country, national: value };
}

export function phoneDraftValue(draft: PhoneDraft): string {
  const rawNumber = draft.national.trim();
  if (!rawNumber) return "";
  // Full international input overrides the selector; never prefix it twice.
  if (rawNumber.startsWith("+")) {
    if (draft.country && !hydratePhone(rawNumber).country) throw new Error("Correct the unrecognized international number to match your chosen country, paste a full +international number, or clear the field.");
    return normalizeContactPhone(rawNumber);
  }
  if (!draft.country) throw new Error("Choose a country code or paste a full +international number, or clear the field.");
  if (!/^[\d ()-]+$/.test(rawNumber)) throw new Error("Correct this phone number or clear the field.");
  if (draft.country.startsWith("+")) {
    if (!draft.international) throw new Error("Choose a country before editing a shared calling code, or paste a full +international number (also for non-geographic numbers).");
    return normalizeContactPhone(`${draft.country}${rawNumber}`);
  }
  // Preserve loaded/pasted E.164 digits exactly until the owner edits them.
  if (draft.international) return normalizeContactPhone(`+${getCountryCallingCode(draft.country as CountryCode)}${rawNumber}`);
  const parsed = parsePhoneNumberFromString(rawNumber, { defaultCountry: draft.country as CountryCode, extract: false });
  // Parse as national digits, including significant Italian zero and GB trunk zero.
  // Do not require current allocation validity: existing E.164 contacts stay compatible.
  if (!parsed || parsed.ext) throw new Error("Correct this phone number or clear the field.");
  if (parsed.countryCallingCode !== getCountryCallingCode(draft.country as CountryCode)) throw new Error("This number uses a different international calling code. Paste it with + instead of the international dialing prefix, or enter a national number for your chosen country.");
  return normalizeContactPhone(`+${getCountryCallingCode(draft.country as CountryCode)}${parsed.nationalNumber}`);
}
