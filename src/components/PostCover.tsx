import { useEffect, useState } from 'react';

export function PostCover({
  className,
  coverImage,
  loading,
}: {
  className: string;
  coverImage?: string;
  loading?: 'eager' | 'lazy';
}) {
  const [isBroken, setIsBroken] = useState(false);
  const imageUrl = coverImage?.trim() ?? '';

  useEffect(() => {
    setIsBroken(false);
  }, [imageUrl]);

  if (!imageUrl || isBroken) {
    return null;
  }

  return (
    <div className={className}>
      <img alt="" loading={loading} onError={() => setIsBroken(true)} src={imageUrl} />
    </div>
  );
}
