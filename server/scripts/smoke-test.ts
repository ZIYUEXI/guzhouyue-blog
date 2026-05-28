import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';

const app = buildApp();

const health = await app.inject({ method: 'GET', url: '/api/health' });
const site = await app.inject({ method: 'GET', url: '/api/site' });
const articles = await app.inject({ method: 'GET', url: '/api/articles' });
const detail = await app.inject({ method: 'GET', url: '/api/articles/slow-writing-under-moon' });
const publicGallery = await app.inject({ method: 'GET', url: '/api/gallery' });
const adminGalleryAnonymous = await app.inject({ method: 'GET', url: '/api/admin/gallery' });
const login = await app.inject({
  method: 'POST',
  url: '/api/admin/login',
  payload: { password: config.adminPassword },
});
const cookie = login.headers['set-cookie'];
const admin = await app.inject({
  method: 'GET',
  url: '/api/admin/content',
  headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? '' },
});
const adminGallery = await app.inject({
  method: 'GET',
  url: '/api/admin/gallery',
  headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? '' },
});
const hiddenAlbum = await app.inject({
  method: 'POST',
  url: '/api/admin/gallery/albums',
  headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? '' },
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
    cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? '',
    'content-type': `multipart/form-data; boundary=${invalidUploadBoundary}`,
  },
  payload: invalidUploadPayload,
});
if (hiddenAlbum.statusCode === 201) {
  await app.inject({
    method: 'DELETE',
    url: '/api/admin/gallery/albums/hidden-smoke-gallery',
    headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? '' },
  });
}

await app.close();

const result = {
  health: health.statusCode,
  site: site.statusCode,
  articles: articles.statusCode,
  detail: detail.statusCode,
  publicGallery: publicGallery.statusCode,
  adminGalleryAnonymous: adminGalleryAnonymous.statusCode,
  login: login.statusCode,
  admin: admin.statusCode,
  adminGallery: adminGallery.statusCode,
  hiddenAlbum: hiddenAlbum.statusCode,
  invalidUpload: invalidUpload.statusCode,
  articleTotal: articles.json().total,
  adminPosts: admin.json().posts.length,
  adminGalleryTotal: adminGallery.json().items.length,
};

console.log(JSON.stringify(result, null, 2));
