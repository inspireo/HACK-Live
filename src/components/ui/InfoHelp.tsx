import { useId, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Info, X } from 'lucide-react';

/** Supplemental guidance only. Keep this outside labels and action buttons. */
export function InfoHelp({ label, children, tone = 'dark' }: { label: string; children: ReactNode; tone?: 'dark' | 'light' }) {
  const titleId = useId();
  return <Popover.Root>
    <Popover.Trigger type="button" className={`ui-info ui-${tone}`} aria-label={`Help: ${label}`}><Info size={18} aria-hidden="true" /></Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className={`ui-help ui-${tone}`} sideOffset={6} collisionPadding={12} aria-labelledby={titleId}>
        <div className="ui-help-heading"><h2 id={titleId}>{label}</h2><Popover.Close type="button" className="ui-info" aria-label={`Close help: ${label}`}><X size={18} aria-hidden="true" /></Popover.Close></div>
        <div className="ui-help-body">{children}</div>
        <Popover.Arrow className="ui-help-arrow" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
