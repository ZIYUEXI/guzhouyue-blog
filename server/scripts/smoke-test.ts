import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';

const app = buildApp();

const health = await app.inject({ method: 'GET', url: '/api/health' });
const site = await app.inject({ method: 'GET', url: '/api/site' });
const articles = await app.inject({ method: 'GET', url: '/api/articles' });
const firstArticleSlug = articles.json().items?.[0]?.slug;
const detail = await app.inject({ method: 'GET', url: `/api/articles/${encodeURIComponent(firstArticleSlug ?? '')}` });
const firstArticlePublishedAt = detail.json().article?.publishedAt ?? new Date().toISOString();
const publicGallery = await app.inject({ method: 'GET', url: '/api/gallery' });
const firstPublicGalleryAlbum = publicGallery.json().items?.[0];
const publicGalleryImages = firstPublicGalleryAlbum
  ? await app.inject({
      method: 'GET',
      url: `/api/gallery/albums/${encodeURIComponent(firstPublicGalleryAlbum.slug ?? firstPublicGalleryAlbum.id)}/images?page=1&pageSize=12`,
    })
  : null;
const adminGalleryAnonymous = await app.inject({ method: 'GET', url: '/api/admin/gallery' });
const login = await app.inject({
  method: 'POST',
  url: '/api/admin/login',
  payload: { password: config.adminPassword },
});
const cookie = login.headers['set-cookie'];
const cookieHeader = Array.isArray(cookie) ? cookie.join('; ') : cookie ?? '';
const csrfToken = (Array.isArray(cookie) ? cookie : [cookie ?? ''])
  .find((value) => value.includes(`${config.csrfCookieName}=`))
  ?.match(new RegExp(`${config.csrfCookieName}=([^;]+)`))?.[1] ?? '';
const adminWriteHeaders = { cookie: cookieHeader, 'x-csrf-token': csrfToken };
const admin = await app.inject({
  method: 'GET',
  url: '/api/admin/content',
  headers: { cookie: cookieHeader },
});
const firstAdminArticle = admin.json().posts?.[0];
const firstAdminArticleId = firstAdminArticle?.id ?? '';
const firstAdminArticleTitle = firstAdminArticle?.title ?? '';
const adminGallery = await app.inject({
  method: 'GET',
  url: '/api/admin/gallery',
  headers: { cookie: cookieHeader },
});
const adminOps = await app.inject({
  method: 'GET',
  url: '/api/admin/ops',
  headers: { cookie: cookieHeader },
});
const adminCommandsAnonymous = await app.inject({
  method: 'GET',
  url: '/api/admin/commands',
});
const adminCommandGuide = await app.inject({
  method: 'GET',
  url: '/api/admin/commands',
  headers: { cookie: cookieHeader },
});
const adminCommandParse = await app.inject({
  method: 'POST',
  url: '/api/admin/commands/parse',
  headers: adminWriteHeaders,
  payload: { input: `article:set-date ${firstArticleSlug} --date=${firstArticlePublishedAt}` },
});
const adminCommandRun = await app.inject({
  method: 'POST',
  url: '/api/admin/commands/run',
  headers: adminWriteHeaders,
  payload: { input: `article:set-date ${firstArticleSlug} --date=${firstArticlePublishedAt}` },
});
const adminCommandListIds = await app.inject({
  method: 'POST',
  url: '/api/admin/commands/run',
  headers: adminWriteHeaders,
  payload: { input: 'article:list-ids' },
});
const adminCommandGetContent = await app.inject({
  method: 'POST',
  url: '/api/admin/commands/run',
  headers: adminWriteHeaders,
  payload: { input: `article:get-content ${firstAdminArticleId}` },
});
const adminCommandSetTitle = await app.inject({
  method: 'POST',
  url: '/api/admin/commands/run',
  headers: adminWriteHeaders,
  payload: { input: `article:set-title ${firstAdminArticleId} --title="${firstAdminArticleTitle}"` },
});
const hiddenAlbum = await app.inject({
  method: 'POST',
  url: '/api/admin/gallery/albums',
  headers: adminWriteHeaders,
  payload: {
    slug: 'hidden-smoke-gallery',
    title: '隐藏测试相册',
    description: '只会出现在管理员图库。',
    isPublic: false,
  },
});
const invalidUploadBoundary = '----guzhouyue-smoke-boundary';
const invalidUploadPayload = [
  `--${invalidUploadBoundary}`,
  'Content-Disposition: form-data; name="image"; filename="note.txt"',
  'Content-Type: text/plain',
  '',
  'not an image',
  `--${invalidUploadBoundary}--`,
  '',
].join('\r\n');
const invalidUpload = await app.inject({
  method: 'POST',
  url: '/api/admin/gallery/albums/moonlight/images',
  headers: {
    ...adminWriteHeaders,
    'content-type': `multipart/form-data; boundary=${invalidUploadBoundary}`,
  },
  payload: invalidUploadPayload,
});
const systemAlbumDelete = await app.inject({
  method: 'DELETE',
  url: '/api/admin/gallery/albums/album-moonlight',
  headers: adminWriteHeaders,
});
const systemImageDelete = await app.inject({
  method: 'DELETE',
  url: '/api/admin/gallery/images/image-guzhouyue-avatar',
  headers: adminWriteHeaders,
});
if (hiddenAlbum.statusCode === 201) {
  await app.inject({
    method: 'DELETE',
    url: '/api/admin/gallery/albums/hidden-smoke-gallery',
    headers: adminWriteHeaders,
  });
}
const adminAudit = await app.inject({
  method: 'GET',
  url: '/api/admin/audit',
  headers: { cookie: cookieHeader },
});
const rss = await app.inject({ method: 'GET', url: '/rss.xml' });
const sitemap = await app.inject({ method: 'GET', url: '/sitemap.xml' });

await app.close();

const result = {
  health: health.statusCode,
  site: site.statusCode,
  articles: articles.statusCode,
  detail: detail.statusCode,
  publicGallery: publicGallery.statusCode,
  publicGalleryImages: publicGalleryImages?.statusCode ?? 200,
  publicGalleryImagePageSize: publicGalleryImages?.json().pageSize ?? 0,
  adminGalleryAnonymous: adminGalleryAnonymous.statusCode,
  login: login.statusCode,
  admin: admin.statusCode,
  adminGallery: adminGallery.statusCode,
  adminOps: adminOps.statusCode,
  adminCommandsAnonymous: adminCommandsAnonymous.statusCode,
  adminCommandGuide: adminCommandGuide.statusCode,
  adminCommandRegistryCount: adminCommandGuide.json().commands.length,
  adminCommandParseOk: adminCommandParse.json().ok,
  adminCommandRunStatus: adminCommandRun.json().status,
  adminCommandArticleDate: adminCommandRun.json().result?.article?.publishedAt,
  adminCommandListIdsStatus: adminCommandListIds.json().status,
  adminCommandListIdsCount: adminCommandListIds.json().result?.count,
  adminCommandGetContentStatus: adminCommandGetContent.json().status,
  adminCommandSetTitleStatus: adminCommandSetTitle.json().status,
  hiddenAlbum: hiddenAlbum.statusCode,
  invalidUpload: invalidUpload.statusCode,
  systemAlbumDelete: systemAlbumDelete.statusCode,
  systemImageDelete: systemImageDelete.statusCode,
  rssUsesPostsRoute: rss.body.includes('/posts/') && !rss.body.includes('/articles/'),
  sitemapUsesPostsRoute: sitemap.body.includes('/posts/') && !sitemap.body.includes('/articles/'),
  auditEntries: adminAudit.json().items.length,
  databaseOk: adminOps.json().database.ok,
  articleTotal: articles.json().total,
  detailSlug: firstArticleSlug,
  adminPosts: admin.json().posts.length,
  adminGalleryTotal: adminGallery.json().items.length,
};

console.log(JSON.stringify(result, null, 2));
