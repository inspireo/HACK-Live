import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { InfoHelp } from './InfoHelp';

export const controlClass = 'ui-control';
export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type={type} className={`ui-button ui-button-${variant} ${className}`} {...props} />;
}
export function Field({ label, htmlFor, help, children }: { label: string; htmlFor: string; help?: ReactNode; children: ReactNode }) {
  return <div className="ui-field"><div className="ui-heading-row"><label htmlFor={htmlFor}>{label}</label>{help && <InfoHelp label={label}>{help}</InfoHelp>}</div>{children}</div>;
}
export function Section({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return <section className="ui-section" aria-labelledby={headingId}><div className="ui-heading-row"><h2 id={headingId}>{title}</h2>{help && <InfoHelp label={title}>{help}</InfoHelp>}</div>{children}</section>;
}
