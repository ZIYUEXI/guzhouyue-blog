import { defaultFeaturedSeries, defaultHomepageCopy, defaultNoteSections } from '../../src/contentStore.js';
import { posts } from '../../src/posts.js';
import { siteSettings } from '../../src/siteSettings.js';
import { parseDateLabel, slugify } from '../src/content.js';
import { db, nowIso } from '../src/db.js';

const now = nowIso();

const seed = db.transaction(() => {
  const existingSiteSettings = db
    .prepare('SELECT owner_name AS ownerName, owner_avatar_url AS ownerAvatarUrl FROM site_settings WHERE id = ?')
    .get('site') as { ownerName: string; ownerAvatarUrl: string } | undefined;
  const defaultOwnerName = existingSiteSettings?.ownerName ?? siteSettings.ownerName;
  const defaultOwnerAvatarUrl = existingSiteSettings?.ownerAvatarUrl ?? siteSettings.ownerAvatarUrl;

  const insertSection = db.prepare(`
    INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
      description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at
  `);

  defaultNoteSections.forEach((section, index) => {
    insertSection.run(`section_${slugify(section.category)}`, section.category, slugify(section.category), section.description, index, now, now);
  });

  const sectionRows = db.prepare('SELECT id, name FROM note_sections').all() as Array<{ id: string; name: string }>;
  const categoryIds = new Map(sectionRows.map((section) => [section.name, section.id]));

  const insertArticle = db.prepare(`
    INSERT INTO articles (
      id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
      tone, tags_json, body_markdown, seo_title, seo_description, cover_image
    )
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt,
      category_id = excluded.category_id,
      status = excluded.status, published_at = excluded.published_at,
      updated_at = excluded.updated_at, tone = excluded.tone, tags_json = excluded.tags_json,
      body_markdown = excluded.body_markdown, seo_title = excluded.seo_title,
      seo_description = excluded.seo_description, cover_image = excluded.cover_image
  `);

  posts.forEach((post) => {
    const publishedAt = parseDateLabel(post.date);
    insertArticle.run(
      `article_${post.slug}`,
      post.slug,
      post.title,
      post.excerpt,
      categoryIds.get(post.category) ?? null,
      defaultOwnerName,
      publishedAt,
      publishedAt,
      now,
      post.tone,
      JSON.stringify(post.tags),
      post.bodyMarkdown ?? post.body.join('\n\n'),
      post.title,
      post.excerpt,
      post.coverImage ?? '',
    );
  });

  db.prepare(`
    INSERT INTO site_settings (id, style_preset, color_scheme, owner_name, owner_avatar_url, updated_at)
    VALUES ('site', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(siteSettings.stylePreset, 'light', siteSettings.ownerName, defaultOwnerAvatarUrl, now);
  db.prepare(`
    UPDATE site_settings
    SET owner_avatar_url = ?, updated_at = ?
    WHERE id = 'site' AND owner_avatar_url = ''
  `).run(siteSettings.ownerAvatarUrl, now);

  db.prepare(`
    INSERT INTO homepage_copy (id, payload_json, updated_at)
    VALUES ('homepage', ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(defaultHomepageCopy), now);

  db.prepare('DELETE FROM featured_series').run();
  const insertSeries = db.prepare(`
    INSERT INTO featured_series (id, title, lead, body, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSeriesItem = db.prepare(`
    INSERT INTO featured_series_items (series_id, article_id, sort_order)
    SELECT ?, id, ? FROM articles WHERE slug = ?
  `);

  defaultFeaturedSeries.forEach((series, index) => {
    insertSeries.run(series.id, series.title, series.lead, series.body, index, now, now);
    series.postSlugs.forEach((slug, itemIndex) => insertSeriesItem.run(series.id, itemIndex, slug));
  });

  const gallerySeedState = db
    .prepare('SELECT value FROM seed_state WHERE key = ?')
    .get('default-gallery') as { value: string } | undefined;

  if (!gallerySeedState) {
    db.prepare(`
      INSERT INTO gallery_albums (id, slug, title, description, cover_image_id, is_public, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      'album-moonlight',
      'system',
      '系统图库',
      '维护博客各页面使用的公共图片，不包含文章正文图片。',
      'image-guzhouyue-hero',
      now,
      now,
    );

    const defaultAlbum = db.prepare('SELECT id FROM gallery_albums WHERE id = ?').get('album-moonlight');
    if (defaultAlbum) {
      const insertGalleryImage = db.prepare(`
        INSERT INTO gallery_images (
          id, album_id, title, description, image_url, file_name, mime_type, size_bytes,
          captured_at, is_public, sort_order, created_at, updated_at
        )
        VALUES (?, 'album-moonlight', ?, ?, ?, '', '', 0, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);

      insertGalleryImage.run(
        'image-guzhouyue-avatar',
        '作者头像',
        '全站作者信息和文章署名使用的头像。',
        '/images/guzhouyue-avatar.png',
        '2026.05.21',
        0,
        now,
        now,
      );
      insertGalleryImage.run(
        'image-guzhouyue-hero',
        '孤舟月首屏',
        '古风月色下的孤舟视觉。',
        '/images/guzhouyue-hero.png',
        '2026.05.21',
        1,
        now,
        now,
      );
      insertGalleryImage.run(
        'image-guzhouyue-cyber',
        '赛博月色',
        '另一种更冷亮的站点视觉。',
        '/images/guzhouyue-hero-cyber.png',
        '2026.05.21',
        2,
        now,
        now,
      );
    }

    db.prepare(
      `
        INSERT INTO seed_state (key, value, updated_at)
        VALUES ('default-gallery', 'seeded', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
    ).run(now);
  }

  const systemGallery = db.prepare('SELECT id FROM gallery_albums WHERE id = ?').get('album-moonlight');
  if (systemGallery) {
    db.prepare(`
      INSERT INTO gallery_images (
        id, album_id, title, description, image_url, file_name, mime_type, size_bytes,
        captured_at, is_public, sort_order, created_at, updated_at
      )
      VALUES (?, 'album-moonlight', ?, ?, ?, '', '', 0, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      'image-guzhouyue-avatar',
      '作者头像',
      '全站作者信息和文章署名使用的头像。',
      '/images/guzhouyue-avatar.png',
      '2026.05.21',
      0,
      now,
      now,
    );
  }
});

seed();

console.log(`Seed complete: ${posts.length} articles, ${defaultNoteSections.length} note sections.`);
