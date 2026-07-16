import type { GalleryAlbum, GalleryImage } from '../contentStore';
import { systemGalleryAlbumId, systemGalleryAlbumSlug } from '../contentStore';
import { systemGalleryAssetUrls } from '../siteSettings';

const supportedComposerImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const compressibleComposerImageMimeTypes = new Set(['image/jpeg', 'image/png']);
const composerImageMaxDimension = 1600;
const composerImageCompressionQuality = 0.78;

export function sortGalleryAlbums(albums: GalleryAlbum[]) {
  return [...albums].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

export function sortGalleryImages(images: GalleryImage[]) {
  return [...images].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

export function isSystemGalleryAlbum(album: GalleryAlbum) {
  return album.id === systemGalleryAlbumId || album.slug === systemGalleryAlbumSlug;
}

export function isLocalGalleryAlbumDraft(album: GalleryAlbum) {
  return /^album-\d+$/.test(album.id) && /^gallery-\d+$/.test(album.slug);
}

export function getSystemGalleryImageUrls(albums: GalleryAlbum[]) {
  const systemImages = albums.find((album) => isSystemGalleryAlbum(album))?.images ?? [];

  return {
    avatar: systemImages.find((image) => image.id === 'image-guzhouyue-avatar')?.imageUrl,
    classic: systemImages.find((image) => image.id === 'image-guzhouyue-hero')?.imageUrl,
    cyber: systemImages.find((image) => image.id === 'image-guzhouyue-cyber')?.imageUrl,
  };
}

export function getActiveOwnerAvatarUrl(ownerAvatarUrl: string, systemGalleryImages: ReturnType<typeof getSystemGalleryImageUrls>) {
  return ownerAvatarUrl === systemGalleryAssetUrls.avatarImage ? systemGalleryImages.avatar ?? ownerAvatarUrl : ownerAvatarUrl;
}

export function normalizeGalleryImageOrder(images: GalleryImage[]) {
  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
  }));
}

export function withGalleryAlbumImages(album: GalleryAlbum, images: GalleryImage[]) {
  const coverImage = images.find((image) => image.id === album.coverImageId) ?? images[0] ?? null;

  return {
    ...album,
    coverImageId: coverImage?.id ?? null,
    coverImageUrl: coverImage?.imageUrl ?? '',
    imageCount: images.length,
    images,
  };
}

export function isSupportedComposerImageFile(file: File) {
  return supportedComposerImageMimeTypes.has(file.type);
}

export async function prepareComposerImageForUpload(file: File) {
  if (!compressibleComposerImageMimeTypes.has(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, composerImageMaxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', composerImageCompressionQuality);
    });
    if (!blob || blob.size >= file.size * 0.92) {
      return file;
    }

    const safeName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${safeName}.webp`, {
      lastModified: file.lastModified,
      type: 'image/webp',
    });
  } catch {
    return file;
  }
}

export function hasImageFileInTransfer(dataTransfer: DataTransfer) {
  if (Array.from(dataTransfer.files ?? []).some((file) => file.type.startsWith('image/'))) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file' && item.type.startsWith('image/'));
}

export function getImageFilesFromTransfer(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) {
    return files.filter((file) => file.type.startsWith('image/'));
  }

  return Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null))
    .filter((file): file is File => file !== null);
}

export function escapeMarkdownAltText(value: string) {
  return value.replace(/[\r\n[\]]/g, ' ').trim() || '图片';
}

export function createComposerImageTitle(file: File, index: number) {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim();
  if (baseName && !/^image$/i.test(baseName)) {
    return baseName.slice(0, 80);
  }

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `截图-${timestamp}${index > 0 ? `-${index + 1}` : ''}`;
}
