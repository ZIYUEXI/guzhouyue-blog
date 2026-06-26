import type { ReactNode } from 'react';

export function PanelHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}
