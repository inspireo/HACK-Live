import React, { useId, type ReactNode } from "react";
import { InfoHelp } from "./components/ui/InfoHelp";
import { editPhone, neutralCallingCodes, phoneCountries, type PhoneDraft } from "../shared/phone-draft";

export function PhoneInput({ label, draft, onChange, disabled, inputClass, helpId, help }: { label: string; draft: PhoneDraft; onChange: (draft: PhoneDraft) => void; disabled?: boolean; inputClass: string; helpId?: string; help?: ReactNode }) {
  const numberId = useId();
  const fallback = neutralCallingCodes.find(({ code }) => draft.country === `+${code}`);
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0 items-end">
    <label className="block min-w-0">{label === "Mobile number" ? "Mobile country code" : "WhatsApp country code"}
      <select className={inputClass} value={draft.country} disabled={disabled} autoComplete="tel-country-code" aria-describedby={helpId} onChange={event => onChange({ national: draft.national, country: event.target.value })}>
        <option value="">Choose country code</option>
        {neutralCallingCodes.filter(({ code }) => draft.country === `+${code}`).map(({ code, label: codeLabel }) => <option key={code} value={`+${code}`}>+{code} ({codeLabel})</option>)}
        {phoneCountries.map(({ country, code, name }) => <option key={country} value={country}>{name} (+{code})</option>)}
      </select>
    </label>
    <div className="min-w-0"><div className="ui-heading-row"><label htmlFor={numberId}>{label}</label>{help && <InfoHelp label={label}>{help}</InfoHelp>}</div><input id={numberId} className={inputClass} type="tel" inputMode="tel" autoComplete="tel-national" aria-describedby={helpId} disabled={disabled} value={draft.national} maxLength={500} onChange={event => onChange(editPhone(draft, event.target.value))} /></div>
    {fallback && <p className="text-sm sm:col-span-2">{fallback.label === "shared calling code" ? "Choose a country before editing this number, or paste a full international number starting with +." : "To change this number, paste a full international number starting with +."}</p>}
  </div>;
}
