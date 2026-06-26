import type { ReactNode } from 'react';
import { Feather } from 'lucide-react';

export function SectionHeading({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="section-heading">
      <span>
        <Feather size={16} />
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {action}
    </div>
  );
}
