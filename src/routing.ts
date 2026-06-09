export type Route =
  | { name: 'home' }
  | { name: 'posts'; page: number }
  | { name: 'notes'; page: number }
  | { name: 'archive'; page: number }
  | { name: 'gallery' }
  | { name: 'post'; slug: string }
  | { name: 'not-found' };

export function isAdminPath(pathname: string) {
  return (
    pathname === '/admin' ||
    pathname === '/admin/posts' ||
    pathname === '/admin/posts/new' ||
    /^\/admin\/posts\/[^/]+\/edit$/.test(pathname)
  );
}

export function getRoute(pathname: string): Route {
  if (pathname === '/') {
    return { name: 'home' };
  }

  if (pathname === '/posts') {
    return { name: 'posts', page: 1 };
  }

  const pagedPostsMatch = pathname.match(/^\/posts\/page\/(\d+)$/);
  if (pagedPostsMatch) {
    return { name: 'posts', page: Number(pagedPostsMatch[1]) };
  }

  if (pathname === '/notes') {
    return { name: 'notes', page: 1 };
  }

  const pagedNotesMatch = pathname.match(/^\/notes\/page\/(\d+)$/);
  if (pagedNotesMatch) {
    return { name: 'notes', page: Number(pagedNotesMatch[1]) };
  }

  if (pathname === '/archive') {
    return { name: 'archive', page: 1 };
  }

  const pagedArchiveMatch = pathname.match(/^\/archive\/page\/(\d+)$/);
  if (pagedArchiveMatch) {
    return { name: 'archive', page: Number(pagedArchiveMatch[1]) };
  }

  if (pathname === '/gallery') {
    return { name: 'gallery' };
  }

  const postMatch = pathname.match(/^\/posts\/([^/]+)$/);
  if (postMatch) {
    return { name: 'post', slug: decodeURIComponent(postMatch[1]) };
  }

  return { name: 'not-found' };
}
