import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { fetchPublicGalleryAlbumImages, normalizeApiGalleryImage } from './apiClient';
import { systemGalleryAlbumId, systemGalleryAlbumSlug, type GalleryAlbum, type GalleryImage } from './contentStore';

const galleryPageSize = 24;

type GalleryPageState = {
  images: GalleryImage[];
  page: number;
  pageCount: number;
  total: number;
  isLoading: boolean;
  error: string;
};

export function PublicGalleryPage({ albums }: { albums: GalleryAlbum[] }) {
  const publicAlbums = useMemo(
    () => sortGalleryAlbums(albums).filter((album) => album.isPublic && !isSystemGalleryAlbum(album)),
    [albums],
  );
  const [expandedAlbumSlug, setExpandedAlbumSlug] = useState('');
  const [pageByAlbumSlug, setPageByAlbumSlug] = useState<Record<string, number>>({});
  const [remoteImagesByAlbumSlug, setRemoteImagesByAlbumSlug] = useState<Record<string, GalleryPageState>>({});
  const activeAlbum = publicAlbums.find((album) => album.slug === expandedAlbumSlug) ?? null;
  const activeAlbumPage = activeAlbum ? pageByAlbumSlug[activeAlbum.slug] ?? 1 : 1;
  const activeAlbumLocalImages = useMemo(
    () => sortGalleryImages(activeAlbum?.images.filter((image) => image.isPublic) ?? []),
    [activeAlbum],
  );
  const hasLocalImages = activeAlbumLocalImages.length > 0;
  const localPageCount = Math.max(1, Math.ceil(activeAlbumLocalImages.length / galleryPageSize));
  const remotePage = activeAlbum ? remoteImagesByAlbumSlug[activeAlbum.slug] : undefined;
  const images = hasLocalImages
    ? activeAlbumLocalImages.slice((activeAlbumPage - 1) * galleryPageSize, activeAlbumPage * galleryPageSize)
    : remotePage?.images ?? [];
  const pageCount = hasLocalImages ? localPageCount : remotePage?.pageCount ?? 1;
  const totalImages = hasLocalImages ? activeAlbumLocalImages.length : remotePage?.total ?? activeAlbum?.imageCount ?? 0;
  const isLoadingImages = !hasLocalImages && Boolean(remotePage?.isLoading);
  const imageLoadError = !hasLocalImages ? remotePage?.error ?? '' : '';
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const activeImage = activeImageIndex === null ? null : images[activeImageIndex] ?? null;

  useEffect(() => {
    if (expandedAlbumSlug && !publicAlbums.some((album) => album.slug === expandedAlbumSlug)) {
      setExpandedAlbumSlug('');
    }
  }, [expandedAlbumSlug, publicAlbums]);

  useEffect(() => {
    if (!activeAlbum || hasLocalImages) {
      return;
    }

    const cachedPage = remoteImagesByAlbumSlug[activeAlbum.slug];
    if (cachedPage?.page === activeAlbumPage && (cachedPage.isLoading || cachedPage.images.length > 0 || cachedPage.error || cachedPage.total === 0)) {
      return;
    }

    let cancelled = false;
    setRemoteImagesByAlbumSlug((currentPages) => ({
      ...currentPages,
      [activeAlbum.slug]: {
        images: cachedPage?.page === activeAlbumPage ? cachedPage.images : [],
        page: activeAlbumPage,
        pageCount: cachedPage?.page === activeAlbumPage ? cachedPage.pageCount : 1,
        total: cachedPage?.page === activeAlbumPage ? cachedPage.total : activeAlbum.imageCount,
        isLoading: true,
        error: '',
      },
    }));

    fetchPublicGalleryAlbumImages(activeAlbum.id || activeAlbum.slug, {
      page: activeAlbumPage,
      pageSize: galleryPageSize,
    })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const nextImages = payload.items
          .map(normalizeApiGalleryImage)
          .filter((image): image is GalleryImage => image !== null);
        setRemoteImagesByAlbumSlug((currentPages) => ({
          ...currentPages,
          [activeAlbum.slug]: {
            images: nextImages,
            page: payload.page,
            pageCount: payload.pageCount,
            total: payload.total,
            isLoading: false,
            error: '',
          },
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRemoteImagesByAlbumSlug((currentPages) => ({
          ...currentPages,
          [activeAlbum.slug]: {
            images: [],
            page: activeAlbumPage,
            pageCount: 1,
            total: activeAlbum.imageCount,
            isLoading: false,
            error: '图片加载失败，请稍后再试。',
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeAlbum, activeAlbumPage, hasLocalImages]);

  function moveLightbox(direction: -1 | 1) {
    if (activeImageIndex === null || images.length === 0) {
      return;
    }

    setActiveImageIndex((activeImageIndex + direction + images.length) % images.length);
  }

  function toggleAlbum(album: GalleryAlbum) {
    setExpandedAlbumSlug((currentSlug) => (currentSlug === album.slug ? '' : album.slug));
    setActiveImageIndex(null);
  }

  function setActiveAlbumPage(album: GalleryAlbum, page: number) {
    setPageByAlbumSlug((currentPages) => ({ ...currentPages, [album.slug]: page }));
    setActiveImageIndex(null);
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
        <div className="gallery-album-stack" aria-label="公开相册">
          {publicAlbums.map((album) => {
            const isExpanded = activeAlbum?.slug === album.slug;
            return (
              <article className="gallery-album-panel" key={album.slug}>
                <button
                  className="gallery-album-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={`gallery-album-${album.slug}`}
                  onClick={() => toggleAlbum(album)}
                >
                  <span className="gallery-cover">
                    {album.coverImageUrl ? <img alt="" src={album.coverImageUrl} /> : <ImageIcon size={28} />}
                  </span>
                  <span className="gallery-album-copy">
                    <small>{album.imageCount} 张图片</small>
                    <strong>{album.title}</strong>
                    <span>{album.description || '这个相册还没有说明。'}</span>
                  </span>
                  <ChevronDown className="gallery-album-chevron" size={20} aria-hidden="true" />
                </button>

                {isExpanded && (
                  <div className="gallery-album-body" id={`gallery-album-${album.slug}`}>
                    <div className="gallery-image-toolbar">
                      <span>
                        第 {Math.min(activeAlbumPage, pageCount)} / {pageCount} 页
                      </span>
                      <strong>{totalImages} 张公开图片</strong>
                    </div>
                    <div className="gallery-image-grid" aria-label={`${album.title}图片`}>
                      {isLoadingImages ? (
                        <p className="empty-state">正在加载图片...</p>
                      ) : imageLoadError ? (
                        <p className="empty-state">{imageLoadError}</p>
                      ) : images.length > 0 ? (
                        images.map((image, index) => (
                          <button className="gallery-image-tile" type="button" key={image.id} onClick={() => setActiveImageIndex(index)}>
                            <img alt={image.title} src={image.imageUrl} loading="lazy" />
                            <span>
                              <strong>{image.title}</strong>
                              <small>{image.capturedAt ? formatGalleryTime(image.capturedAt) : album.title}</small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="empty-state">这个公开相册暂时没有图片。</p>
                      )}
                    </div>
                    {pageCount > 1 && (
                      <GalleryPagination
                        page={Math.min(activeAlbumPage, pageCount)}
                        pageCount={pageCount}
                        onPrevious={() => setActiveAlbumPage(album, Math.max(1, activeAlbumPage - 1))}
                        onNext={() => setActiveAlbumPage(album, Math.min(pageCount, activeAlbumPage + 1))}
                      />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
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

function GalleryPagination({
  page,
  pageCount,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="gallery-pagination" aria-label="图库分页">
      <button className="secondary-action" type="button" onClick={onPrevious} disabled={page <= 1}>
        上一页
      </button>
      <span>
        {page} / {pageCount}
      </span>
      <button className="secondary-action" type="button" onClick={onNext} disabled={page >= pageCount}>
        下一页
      </button>
    </nav>
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
