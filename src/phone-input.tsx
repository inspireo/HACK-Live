import React from "react";
import { editPhone, neutralCallingCodes, phoneCountries, type PhoneDraft } from "../shared/phone-draft";

export function PhoneInput({ label, draft, onChange, disabled, inputClass, helpId }: { label: string; draft: PhoneDraft; onChange: (draft: PhoneDraft) => void; disabled?: boolean; inputClass: string; helpId?: string }) {
  const fallback = neutralCallingCodes.find(({ code }) => draft.country === `+${code}`);
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
    <label className="block min-w-0">{label === "Mobile number" ? "Mobile country code" : "WhatsApp country code"}
      <select className={inputClass} value={draft.country} disabled={disabled} autoComplete="tel-country-code" aria-describedby={helpId} onChange={event => onChange({ national: draft.national, country: event.target.value })}>
        <option value="">Choose country code</option>
        {neutralCallingCodes.filter(({ code }) => draft.country === `+${code}`).map(({ code, label: codeLabel }) => <option key={code} value={`+${code}`}>+{code} ({codeLabel})</option>)}
        {phoneCountries.map(({ country, code, name }) => <option key={country} value={country}>{name} (+{code})</option>)}
      </select>
    </label>
    <label className="block min-w-0">{label}<input className={inputClass} type="tel" inputMode="tel" autoComplete="tel-national" aria-describedby={helpId} disabled={disabled} value={draft.national} maxLength={500} onChange={event => onChange(editPhone(draft, event.target.value))} /></label>
    {fallback && <p className="text-sm sm:col-span-2">{fallback.label === "shared calling code" ? "Choose a country before editing this number, or paste a full international number starting with +." : "To change this number, paste a full international number starting with +."}</p>}
  </div>;
}
