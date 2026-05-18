export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readingTime: string;
  tone: string;
  tags: string[];
  body: string[];
};

export const posts: Post[] = [
  {
    slug: 'slow-writing-under-moon',
    title: '月下独行：关于慢写作的几个念头',
    excerpt: '不是所有表达都需要赶路，有些文字适合在夜里慢慢抵达。',
    category: '人间札记',
    date: '2026.05.15',
    readingTime: '6 分钟读完',
    tone: 'ink',
    tags: ['写作', '生活', '夜色'],
    body: [
      '慢写作不是把句子故意拖长，也不是把一件简单的事说得迂回。它更像是在纸面上留出呼吸，让一个念头从最初的影子走到可以被看清的位置。',
      '有些表达适合立即发出，像窗外忽然落下的一阵雨，快、亮、带着现场的气味。也有些表达需要在夜里放一放，等情绪退潮之后，才知道真正值得留下的是哪一句。',
      '我越来越相信，写作首先是一种整理生活的方式。不是把生活包装成答案，而是承认许多时刻本来就没有结论，只能先把它们安放在段落里。',
      '月光照在路面上时，并不会催促行人。它只是安静地把边界照出来：哪些是水，哪些是石，哪些是还没走完的路。慢写作也该如此。',
    ],
  },
  {
    slug: 'rebuild-page-under-moonlight',
    title: '在月光下重构一个页面',
    excerpt: '把复杂交互折回清晰边界，像把水面上的倒影慢慢扶正。',
    category: '技术笔记',
    date: '2026.05.08',
    readingTime: '8 分钟读完',
    tone: 'pine',
    tags: ['前端', '重构', '交互'],
    body: [
      '一个页面变复杂，通常不是因为它真的承担了太多职责，而是因为许多临时决定没有被重新整理。按钮多一个，状态多一层，条件判断再补一行，最后读代码的人就像在雾里找路。',
      '重构的第一步不是移动文件，而是重新确认边界。哪些状态属于页面，哪些状态属于组件，哪些数据应该独立出来，哪些交互只是视觉反馈。边界清楚以后，代码自然会变短。',
      '这次我最想保留的是页面原本的气质。技术改造不应该抹掉一个站点已经建立起来的语气，只需要把无法使用的入口接通，把看得见的内容变成真的可以阅读。',
      '好的前端页面不是把所有能力堆在首屏，而是让用户每一次点击都有去处。能读、能找、能返回，这些朴素的事情，比装饰更接近一个博客的骨架。',
    ],
  },
  {
    slug: 'echoes-inside-pages',
    title: '纸页里的回声',
    excerpt: '读书摘录不只是保存句子，也是在保存某一刻的自己。',
    category: '读书摘录',
    date: '2026.04.26',
    readingTime: '4 分钟读完',
    tone: 'cinnabar',
    tags: ['阅读', '摘录', '书页'],
    body: [
      '摘录一句话时，我们以为自己是在保存作者的表达。后来才发现，被保存下来的还有当时的天气、心境、房间里那盏灯，以及自己为什么会在那一秒停下来。',
      '同一句话隔几年再读，常常会变成另一句话。不是文字改变了，而是读它的人已经走过了不同的河岸。纸页里的回声，很多时候来自我们自己的变化。',
      '我喜欢把摘录留得短一些。太长的摘录像整片森林，容易让人忘记当时真正发光的是哪一片叶子。短句则像石子，放进口袋里，走远了仍然能摸到。',
    ],
  },
  {
    slug: 'old-town-night-voyage',
    title: '桥边旧城与夜航',
    excerpt: '一次短途行走，路过风、桥、旧城和突然安静下来的湖。',
    category: '山水游踪',
    date: '2026.04.12',
    readingTime: '7 分钟读完',
    tone: 'water',
    tags: ['旅行', '旧城', '湖'],
    body: [
      '傍晚抵达旧城的时候，桥上的风正好从水面穿过来。它没有带来明确的凉意，只是把白天剩下的喧闹一点点吹散。',
      '沿着河边走，店铺的灯一盏接一盏亮起。人声被石板路磨得很轻，偶尔有船从桥洞下经过，水纹把倒影折成几段，又慢慢合回去。',
      '夜航最好的时刻，是城市忽然不再要求你理解它。你只需要坐着，看岸边退远，看月亮落在水里，看自己也暂时成为旅途的一部分。',
      '回程时我想，所谓短途行走并不是为了抵达远方，而是给日常生活开一道小窗。风从那里进来，旧城也从那里进来。',
    ],
  },
];

export const postsPerPage = 2;

export const archive = posts.reduce<Array<{ month: string; entries: Post[] }>>((months, post) => {
  const [year, month] = post.date.split('.');
  const monthLabel = `${year} 年 ${Number(month)} 月`;
  const existingMonth = months.find((item) => item.month === monthLabel);

  if (existingMonth) {
    existingMonth.entries.push(post);
  } else {
    months.push({ month: monthLabel, entries: [post] });
  }

  return months;
}, []);

export function getPostBySlug(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export function getAdjacentPosts(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previousPost: index > 0 ? posts[index - 1] : undefined,
    nextPost: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}
