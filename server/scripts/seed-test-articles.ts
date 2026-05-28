import { parseDateLabel, slugify } from '../src/content.js';
import { db, nowIso } from '../src/db.js';

type TestArticle = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  tone: string;
  tags: string[];
  bodyMarkdown: string;
  comments?: Array<{
    authorName: string;
    content: string;
    createdAt: string;
  }>;
};

const now = nowIso();

const categoryDescriptions = new Map([
  ['功能测试', '验证前台与渲染'],
  ['技术笔记', '记录前端、后端、工程化与系统设计实践。'],
  ['人间札记', '放置日常观察、写作片段和生活记录。'],
  ['读书摘录', '整理阅读笔记、摘录与二次思考。'],
  ['山水游踪', '记录旅行、城市漫游与自然观察。'],
]);

const testArticles: TestArticle[] = [
  {
    slug: 'test-markdown-kitchen-sink',
    title: '测试文章：Markdown 全元素排版',
    excerpt: '覆盖标题、列表、任务列表、引用、表格、链接、行内代码与分隔段落。',
    category: '功能测试',
    publishedAt: '2026.05.21 09:10',
    tone: 'ink',
    tags: ['测试', 'Markdown', '排版', 'SearchNeedleAlpha'],
    bodyMarkdown: `# 一级标题测试

这篇文章用于检查正文排版。这里包含一个唯一搜索词：SearchNeedleAlpha，方便验证站内搜索是否可以命中文章正文。

## 列表与任务

- 普通无序列表第一项
- 普通无序列表第二项，包含 \`inline code\`
- 普通无序列表第三项，包含 [站内首页](/)

1. 有序列表第一项
2. 有序列表第二项
3. 有序列表第三项

- [x] 已完成的任务项
- [ ] 未完成的任务项

> 这是一段引用。它应该有左侧强调线、独立背景，并且在暗色模式下保持可读。

| 功能 | 期望结果 | 测试重点 |
| --- | --- | --- |
| 表格 | 可以横向滚动 | 移动端不撑破页面 |
| 链接 | 有明显样式 | 鼠标悬停可识别 |
| 行内代码 | 与正文区分 | 暗色模式对比度正常 |

---

最后一段用于确认普通段落间距。中文、English、12345 和标点混排应该保持自然。`,
    comments: [
      {
        authorName: '测试读者',
        content: '这条已审核评论用于验证评论列表可以直接展示。',
        createdAt: '2026.05.21 09:30',
      },
    ],
  },
  {
    slug: 'test-code-blocks-and-highlight',
    title: '测试文章：代码块与高亮',
    excerpt: '覆盖 TypeScript、CSS、Shell、JSON 等常见代码块，验证高亮与横向滚动。',
    category: '技术笔记',
    publishedAt: '2026.05.21 09:20',
    tone: 'pine',
    tags: ['测试', '代码高亮', '前端', 'SearchNeedleCode'],
    bodyMarkdown: `这篇文章用于检查代码块渲染，唯一搜索词：SearchNeedleCode。

\`\`\`ts
type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.colorScheme = theme;
}

applyTheme('dark');
\`\`\`

\`\`\`css
:root[data-color-scheme="dark"] {
  color-scheme: dark;
  --paper: #141311;
  --ink: #f5ead8;
}
\`\`\`

\`\`\`json
{
  "name": "guzhouyue-blog",
  "feature": "code-highlight",
  "enabled": true
}
\`\`\`

\`\`\`bash
npm run build
npm run seed:test-articles
\`\`\`

下面是一行很长的代码，用于确认横向滚动不会撑破文章容器：

\`\`\`ts
const veryLongLine = "abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz";
\`\`\``,
  },
  {
    slug: 'test-math-formulas',
    title: '测试文章：数学公式渲染',
    excerpt: '覆盖行内公式与块级公式，验证 KaTeX、段落间距和暗色模式下的可读性。',
    category: '技术笔记',
    publishedAt: '2026.05.21 09:30',
    tone: 'water',
    tags: ['测试', '数学公式', 'KaTeX', 'SearchNeedleMath'],
    bodyMarkdown: `这篇文章用于检查公式渲染，唯一搜索词：SearchNeedleMath。

行内公式应该和正文同一行显示，例如 $E = mc^2$，以及 $a^2 + b^2 = c^2$。

块级公式如下：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

再测试一个带分式和求和的公式：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

公式前后的段落不应该粘连，移动端也不应该溢出页面。`,
  },
  {
    slug: 'test-long-article-pagination-reading',
    title: '测试文章：长文阅读与滚动体验',
    excerpt: '用较长正文测试详情页阅读节奏、滚动、上一篇下一篇和评论区域位置。',
    category: '人间札记',
    publishedAt: '2026.05.21 09:40',
    tone: 'cinnabar',
    tags: ['测试', '长文', '阅读体验', 'SearchNeedleLong'],
    bodyMarkdown: Array.from({ length: 14 }, (_, index) => {
      const paragraphNumber = index + 1;
      return `第 ${paragraphNumber} 段：这是一段用于测试长文阅读体验的正文。它包含足够的中文长度，用来观察行高、段落间距、滚动时的页面背景、顶部导航吸附，以及文章详情页底部的上一篇下一篇区域。唯一搜索词 SearchNeedleLong 只在这篇文章中出现。`;
    }).join('\n\n'),
    comments: [
      {
        authorName: '长文测试员',
        content: '滚动到这里时，评论区域应该仍然清晰可见。',
        createdAt: '2026.05.21 10:00',
      },
      {
        authorName: '另一位读者',
        content: '第二条评论用于测试多评论排序。',
        createdAt: '2026.05.21 10:05',
      },
    ],
  },
  {
    slug: 'test-image-and-media',
    title: '测试文章：图片与媒体排版',
    excerpt: '使用站内图片验证正文图片、替代文本、宽度约束和暗色背景衔接。',
    category: '山水游踪',
    publishedAt: '2026.05.21 09:50',
    tone: 'water',
    tags: ['测试', '图片', '媒体', 'SearchNeedleImage'],
    bodyMarkdown: `这篇文章用于检查图片展示，唯一搜索词：SearchNeedleImage。

![孤舟月首屏图](/images/guzhouyue-hero.png)

图片上方和下方的文字不应该贴得太紧。图片本身应该在窄屏下自动缩放，不撑破正文容器。

![赛博风格首屏图](/images/guzhouyue-hero-cyber.png)

如果图片加载失败，替代文本也应该可见。`,
  },
  {
    slug: 'test-title-tags-search-edge-cases',
    title: '测试文章：很长标题 English 123 与特殊标签混排，用于检查卡片换行和搜索结果展示',
    excerpt: '覆盖很长标题、混合标签、英文数字、搜索命中和列表卡片高度。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:00',
    tone: 'ink',
    tags: ['测试', 'LongTitle', '中文English123', 'SearchNeedleEdge'],
    bodyMarkdown: `这篇文章用于测试边界文本，唯一搜索词：SearchNeedleEdge。

标题很长时，文章列表卡片、搜索结果、详情页标题都应该自然换行，不能压住日期、分类或相邻内容。

标签里包含中文、英文和数字：\`中文English123\`。搜索这些词时应该能找到这篇文章。

再补一段连续英文用于检查换行：

supercalifragilisticexpialidocious-supercalifragilisticexpialidocious-supercalifragilisticexpialidocious
`,
  },
  {
    slug: 'test-category-filter-reading-notes',
    title: '测试文章：分类筛选与读书摘录',
    excerpt: '放在读书摘录分类中，用于验证分类筛选、札记页和归档页的一致性。',
    category: '读书摘录',
    publishedAt: '2026.05.20 22:15',
    tone: 'cinnabar',
    tags: ['测试', '分类筛选', '读书', 'SearchNeedleCategory'],
    bodyMarkdown: `这篇文章用于检查分类筛选，唯一搜索词：SearchNeedleCategory。

当从札记分类进入“读书摘录”时，应该能看到这篇文章。归档页中也应该按发布时间归入 2026 年 5 月。

> 摘录测试：短句应该在引用块中有明显层次。

这也是一段普通正文，用来检查摘录类文章和其他分类的显示是否一致。`,
  },
  {
    slug: 'test-draft-like-but-published',
    title: '测试文章：发布状态与公开接口',
    excerpt: '这篇文章是发布状态，应该能出现在公开列表、搜索、归档和详情页中。',
    category: '功能测试',
    publishedAt: '2026.05.19 08:45',
    tone: 'pine',
    tags: ['测试', '公开接口', '发布状态', 'SearchNeedlePublished'],
    bodyMarkdown: `这篇文章用于确认公开接口只展示已发布文章，唯一搜索词：SearchNeedlePublished。

它会以 \`published\` 状态写入数据库，因此应该可以通过：

- 文章列表
- 搜索弹窗
- 归档页
- 详情页
- RSS / Sitemap 生成逻辑

这些入口访问到。`,
  },
  {
    slug: 'test-featured-short-title',
    title: '短标题测试',
    excerpt: '用于确认首页主推卡在短标题下仍保持原本的视觉气质。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:10',
    tone: 'ink',
    tags: ['测试', '首页主推', '短标题', 'FeaturedLayoutShort'],
    bodyMarkdown: `这篇文章用于测试首页主推卡短标题状态。

短标题应该保持较大的标题气质，不应该因为动态字号逻辑被压得过小。`,
  },
  {
    slug: 'test-featured-medium-title',
    title: '中等长度标题用于检查首页主推卡的正常换行',
    excerpt: '用于确认常见长度标题在首页主推卡里自然换行。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:20',
    tone: 'pine',
    tags: ['测试', '首页主推', '中标题', 'FeaturedLayoutMedium'],
    bodyMarkdown: `这篇文章用于测试首页主推卡中等长度标题。

这类标题通常应该显示为两到三行，并且摘要和日期仍然有稳定位置。`,
  },
  {
    slug: 'test-featured-long-chinese-title',
    title: '这是一篇专门用于压测首页主推文章卡片标题自动缩放能力的超长中文标题',
    excerpt: '用于确认长中文标题不会把卡片撑出巨大空白，也不会挤压摘要和日期。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:30',
    tone: 'cinnabar',
    tags: ['测试', '首页主推', '长中文标题', 'FeaturedLayoutChinese'],
    bodyMarkdown: `这篇文章用于测试首页主推卡超长中文标题。

标题应该自动使用更小字号，并限制在合理行数内。`,
  },
  {
    slug: 'test-featured-long-english-title',
    title: 'Featured Card Layout Stress Test With A Very Long English Title For Responsive Typography',
    excerpt: '用于确认带空格的英文长标题可以正常换行，不会造成主推卡高度异常。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:40',
    tone: 'water',
    tags: ['测试', '首页主推', '英文标题', 'FeaturedLayoutEnglish'],
    bodyMarkdown: `This article checks a long English title in the featured card.

The title should wrap across lines with a smaller density class and keep the card readable.`,
  },
  {
    slug: 'test-featured-unbroken-title',
    title: 'SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious超长无空格标题压力测试',
    excerpt: '用于确认连续英文和中文混合的无空格长串也不会撑破首页主推卡。',
    category: '功能测试',
    publishedAt: '2026.05.21 10:50',
    tone: 'ink',
    tags: ['测试', '首页主推', '无空格长串', 'FeaturedLayoutUnbroken'],
    bodyMarkdown: `这篇文章用于测试最容易撑破布局的无空格长串标题。

标题应该进入最紧凑的字号档位，并允许在任意位置换行。`,
  },
];

const seedTestArticles = db.transaction(() => {
  const insertSection = db.prepare(`
    INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
      description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at
  `);

  for (const [category, description] of categoryDescriptions) {
    const sectionIndex = category === '功能测试' ? 900 : 100;
    insertSection.run(
      `section_${slugify(category)}`,
      category,
      slugify(category),
      description,
      sectionIndex,
      now,
      now,
    );
  }

  const sectionRows = db.prepare('SELECT id, name FROM note_sections').all() as Array<{ id: string; name: string }>;
  const categoryIds = new Map(sectionRows.map((section) => [section.name, section.id]));

  const insertArticle = db.prepare(`
    INSERT INTO articles (
      id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
      tone, tags_json, body_markdown, seo_title, seo_description, cover_image
    )
    VALUES (?, ?, ?, ?, ?, '孤舟月', 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt,
      category_id = excluded.category_id, author_name = excluded.author_name,
      status = excluded.status, published_at = excluded.published_at,
      updated_at = excluded.updated_at, tone = excluded.tone, tags_json = excluded.tags_json,
      body_markdown = excluded.body_markdown, seo_title = excluded.seo_title,
      seo_description = excluded.seo_description, cover_image = excluded.cover_image,
      deleted_at = NULL
  `);

  const deleteComments = db.prepare('DELETE FROM comments WHERE article_id = ? AND id LIKE ?');
  const insertComment = db.prepare(`
    INSERT INTO comments (id, article_id, author_name, content, status, ip_hash, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'approved', '', 'seed-test-articles', ?, ?)
  `);

  for (const article of testArticles) {
    const publishedAt = parseDateLabel(article.publishedAt);
    const articleId = `article_${article.slug}`;

    insertArticle.run(
      articleId,
      article.slug,
      article.title,
      article.excerpt,
      categoryIds.get(article.category) ?? null,
      publishedAt,
      publishedAt,
      now,
      article.tone,
      JSON.stringify(article.tags),
      article.bodyMarkdown,
      article.title,
      article.excerpt,
      '',
    );

    deleteComments.run(articleId, 'comment_test_%');
    article.comments?.forEach((comment, index) => {
      const createdAt = parseDateLabel(comment.createdAt);
      insertComment.run(
        `comment_test_${article.slug}_${index + 1}`,
        articleId,
        comment.authorName,
        comment.content,
        createdAt,
        createdAt,
      );
    });
  }
});

seedTestArticles();

console.log(`Seeded ${testArticles.length} test articles into ${process.env.DATABASE_PATH ?? 'server/data/blog.sqlite'}.`);
