import { normalizeOwnerName } from '../siteSettings';

export function AuthorAvatar({
  ownerAvatarUrl,
  ownerName,
  size = 'medium',
}: {
  ownerAvatarUrl: string;
  ownerName: string;
  size?: 'small' | 'medium' | 'large';
}) {
  const initial = normalizeOwnerName(ownerName).slice(0, 1);

  return (
    <span className={`author-avatar author-avatar-${size}`} aria-hidden="true">
      {ownerAvatarUrl ? <img alt="" src={ownerAvatarUrl} loading="lazy" decoding="async" width={size === 'small' ? 32 : 70} height={size === 'small' ? 32 : 70} /> : <span>{initial}</span>}
    </span>
  );
}
