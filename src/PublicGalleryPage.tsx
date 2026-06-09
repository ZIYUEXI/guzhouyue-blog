import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { systemGalleryAlbumId, systemGalleryAlbumSlug, type GalleryAlbum, type GalleryImage } from './contentStore';

export function PublicGalleryPage({ albums }: { albums: GalleryAlbum[] }) {
  const publicAlbums = useMemo(
    () => sortGalleryAlbums(albums).filter((album) => album.isPublic && !isSystemGalleryAlbum(album)),
    [albums],
  );
  const [activeAlbumSlug, setActiveAlbumSlug] = useState(publicAlbums[0]?.slug ?? '');
  const activeAlbum = publicAlbums.find((album) => album.slug === activeAlbumSlug) ?? publicAlbums[0] ?? null;
  const images = useMemo(() => sortGalleryImages(activeAlbum?.images.filter((image) => image.isPublic) ?? []), [activeAlbum]);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const activeImage = activeImageIndex === null ? null : images[activeImageIndex] ?? null;

  useEffect(() => {
    if (!activeAlbumSlug && publicAlbums[0]) {
      setActiveAlbumSlug(publicAlbums[0].slug);
    }
  }, [activeAlbumSlug, publicAlbums]);

  function moveLightbox(direction: -1 | 1) {
    if (activeImageIndex === null || images.length === 0) {
      return;
    }

    setActiveImageIndex((activeImageIndex + direction + images.length) % images.length);
  }

  return (
    <section className="content-section listing-page gallery-page">
      <div className="section-heading">
        <span>Gallery</span>
        <h2>图库</h2>
      </div>
      <div className="listing-intro">
        <p>按相册浏览公开图片，所有图片均来自后台图库并与站点内容同步。</p>
      </div>

      {publicAlbums.length > 0 ? (
        <>
          <div className="gallery-album-grid" aria-label="公开相册">
            {publicAlbums.map((album) => (
              <button
                className="gallery-album-card"
                type="button"
                key={album.slug}
                aria-pressed={activeAlbum?.slug === album.slug}
                onClick={() => {
                  setActiveAlbumSlug(album.slug);
                  setActiveImageIndex(null);
                }}
              >
                <span className="gallery-cover">
                  {album.coverImageUrl ? <img alt="" src={album.coverImageUrl} /> : <ImageIcon size={28} />}
                </span>
                <div>
                  <span>{album.imageCount} 张图片</span>
                  <h3>{album.title}</h3>
                  <p>{album.description || '这个相册还没有说明。'}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="gallery-image-grid" aria-label={activeAlbum ? `${activeAlbum.title}图片` : '图库图片'}>
            {images.length > 0 ? (
              images.map((image, index) => (
                <button className="gallery-image-tile" type="button" key={image.id} onClick={() => setActiveImageIndex(index)}>
                  <img alt={image.title} src={image.imageUrl} />
                  <span>
                    <strong>{image.title}</strong>
                    <small>{image.capturedAt ? formatGalleryTime(image.capturedAt) : activeAlbum?.title}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="empty-state">这个公开相册暂时没有图片。</p>
            )}
          </div>
        </>
      ) : (
        <p className="empty-state">暂无公开图库。</p>
      )}

      {activeImage && (
        <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={activeImage.title}>
          <div className="gallery-lightbox-panel">
            <button className="gallery-lightbox-close icon-button" type="button" onClick={() => setActiveImageIndex(null)} aria-label="关闭图片">
              <X size={20} />
            </button>
            {images.length > 1 && (
              <button className="gallery-lightbox-nav previous" type="button" onClick={() => moveLightbox(-1)} aria-label="上一张">
                <ChevronRight size={20} />
              </button>
            )}
            <img alt={activeImage.title} src={activeImage.imageUrl} />
            {images.length > 1 && (
              <button className="gallery-lightbox-nav next" type="button" onClick={() => moveLightbox(1)} aria-label="下一张">
                <ChevronRight size={20} />
              </button>
            )}
            <footer>
              <h3>{activeImage.title}</h3>
              {activeImage.description && <p>{activeImage.description}</p>}
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function sortGalleryAlbums(albums: GalleryAlbum[]) {
  return [...albums].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

function sortGalleryImages(images: GalleryImage[]) {
  return [...images].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

function isSystemGalleryAlbum(album: GalleryAlbum) {
  return album.id === systemGalleryAlbumId || album.slug === systemGalleryAlbumSlug;
}

function formatGalleryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
