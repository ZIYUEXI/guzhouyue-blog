# 博客访问性能排查（2026-11-05）

排查日期：2026-11-05（UTC+8）。对象为 `https://ziyuexi.top/` 的公开首页；核对了实际浏览器页面、线上 HTML/资源响应、腾讯云生产源码及本地对应实现。本次完成诊断，功能修复与部署尚未执行。

## 结论与实施顺序

| 顺序 | 已确认的问题 | 建议改动 | 收益与成本 |
| --- | --- | --- | --- |
| P0-1 | 首页静态依赖编辑器包，并同时包含后台、Three.js 星图、Markdown/KaTeX 等实现 | 拆分公开站与后台入口；星图、文章渲染器和编辑器按路由加载；调整分包规则，避免首页共享依赖被归入 editor 包 | 直接减少白屏前的下载、解析与执行量；中等改动 |
| P0-2 | 首屏背景 PNG 1.87 MB；页面的 32/70 px 头像使用 2.32 MB 原图，且没有延迟加载 | 背景生成 WebP/AVIF 和响应式尺寸；头像生成 128/160 px 缩略图；首屏背景优先加载，屏外头像延迟加载 | 明确可消除数 MB 的下载；较小改动，最容易先取得效果 |
| P0-3 | 首次进入下载全部 82 篇文章正文，且首页等 site/articles/gallery 三个请求全部完成后才更新内容 | 首页和列表加载摘要索引；详情按 slug 读取正文；图库按路由加载；全文搜索打开时单独读取搜索数据，保留现有 Worker | 减少下载、JSON 解析与同步缓存开销，并消除图库对首页数据展示的阻塞；中等改动 |
| P1-1 | 带哈希的 JS/CSS 仅缓存 4 小时；公开 JSON 要求每次重新验证；本次访问落在海外 Cloudflare 节点 | 哈希资源使用一年 immutable 缓存；公开快照采用版本化文件与小清单，或短 TTL 配合发布失效；复测目标访客网络 | 改善回访与导航；配置改动小，快照版本化改动中等 |
| P1-2 | 启动读取完整 localStorage 内容，更新后同步序列化并写回；公开页面链接会完整导航 | 只缓存必要摘要，正文缓存异步/按需；公开站使用客户端导航，避免每次跳页重复初始化全站 | 改善回访和低性能设备体验；中等改动，耗时收益需要浏览器性能采样 |
| P2 | HTML 的 root 为空，正文和主图均依赖 JavaScript 启动后生成 | 后续考虑首页/文章静态预渲染；合并前验证首屏、SEO 与发布链路 | 进一步改善首次内容呈现；改动较大，放在前述减重之后 |

建议先执行图片减重与首页依赖拆分，再改数据加载；缓存配置随带版本资源一起落地。当前没有证据支持把升级腾讯云机器放在首位。

## 线上直接证据

### 1. 首屏 JavaScript

线上 HTML 明确包含：

```html
<script type="module" crossorigin src="/assets/index-XLN4LtVQ.js"></script>
<link rel="modulepreload" crossorigin href="/assets/editor-C3_EcViK.js">
<link rel="stylesheet" crossorigin href="/assets/editor-BJMqBCNh.css">
```

入口 JS 自身也静态 `import ... from "./editor-C3_EcViK.js"`。因此即使 `RichMarkdownEditor` 使用了 React.lazy，这份编辑器包仍在首页关键依赖中；只删除 preload 标签不能解除依赖。

| 资源 | 解压后字节 | 本次 gzip 传输字节 |
| --- | ---: | ---: |
| index-XLN4LtVQ.js | 2,296,439 | 578,520 |
| editor-C3_EcViK.js | 2,359,975 | 779,379 |
| 合计 | 4,656,414 | 1,357,899 |

入口代码中确认有 Three.js WebGLRenderer 和 KaTeX 实现；editor 包中确认有 Lexical/MDXEditor。首页还直接加载两份样式，解压后分别为 244,586 和 45,270 字节；该项可以随路由拆分处理，但收益低于 JS 与图片。

对应源码：`src/App.tsx:48` 的后台静态导入、`:60` 的 MarkdownBody、`:78` 的 StarfieldPage、`:228` 的编辑器 lazy；`src/StarfieldPage.tsx:3` 直接导入 Three.js；`vite.config.ts:9` 的 manualChunks 规则。腾讯云上核对到相同分包规则。

### 2. 图片

实际浏览器 DOM 确认背景加载 `/images/guzhouyue-hero.png`，自然尺寸 1672×941；头像加载 `/uploads/gallery/system-image-guzhouyue-avatar-mq3ir2qs-56b28a6f9fa0b785.png`，自然尺寸 1536×1024，两个显示实例分别为 70×70 与 32×32。两个头像实例共享一个 URL，体积按一个资源计算。

HTTP Content-Length 分别为 1,866,934 与 2,321,272 字节，合计 4,188,206 字节。头像的 loading 为 auto，虽位于页面较下方仍会主动请求。

用本地对应素材进行内存试压（WebP quality=82，非线上替换）：

| 素材 | 尺寸 | 试压字节 |
| --- | --- | ---: |
| 桌面背景 | 1280×720 | 44,268 |
| 手机背景 | 768×432 | 18,990 |
| 头像 | 128×128 | 2,702 |

这是格式与尺寸优化的体积潜力，最终尺寸和画质需在实施时检查。相关位置：`src/public/HomePage.tsx:99` 的 hero 图片；`src/components/AuthorAvatar.tsx` 的无缩略图/无 loading 图片；`src/siteSettings.ts:20` 的背景资源地址。

### 3. 首次下载全库正文

线上 `/data/articles.json` 共 82 篇公开文章，解压 1,352,985 字节、gzip 283,411 字节；每条包含 `body` 与 `bodyMarkdown`。在相同线上数据上去除正文并紧凑序列化后，摘要索引为 95,188 字节、gzip 24,420 字节。首页数据不必承受全部正文成本。

`src/App.tsx:438` 使用 Promise.all 一起等待 site/articles/gallery；腾讯云生产源码同样如此。图库快照虽然仅 35,002 字节，本次腾讯云侧请求仍耗时约 2.85 秒，可以拖延其它已完成数据的展示。此处指正式数据更新等待，并非整个页面在请求期间完全空白。

`src/apiClient.ts:545` 对 API 也请求 pageSize=1000；`server_py/export_public_snapshot.py` 导出同一全量结构。`src/contentStore.ts:241` 在启动时同步解析缓存，`:259` 在更新时同步 JSON.stringify/localStorage.setItem；这部分是已确认的开销路径，未测得独立主线程耗时。

### 4. 缓存与网络

本次响应中：

- JS、CSS、图片：`Cache-Control: public, max-age=14400, must-revalidate`。
- HTML 和 data JSON：`Cache-Control: public, max-age=0, must-revalidate`。
- 前端 `requestStaticJson` 还显式设置 `cache: 'no-cache'`，会要求重新验证；不等于每次必定下载完整响应，服务端仍可能返回 304。
- 本机样本的 CF-RAY 节点为 LAX；腾讯云侧样本为 AMS。说明所测链路使用海外节点，不能据此断言所有国内访客均走同一节点。
- 本机首页两次成功请求首字节约 1.85/1.34 秒；小 CSS 在复测时约 0.90 秒下载完成。首次大 JS/图片探测在 40 秒上限内未下载完，部分 JSON 也超时。
- 腾讯云侧可完整获取资源：主 JS 单次约 2.30 秒；另一轮独立 gzip 采样约 5.08 秒，editor 约 2.89 秒、文章 JSON 约 2.34 秒。各工具压缩协商与链路不同，不能把这些时间相加当成页面加载时长。

本机曾并发运行资源探测，超时样本包含共享链路影响，不能直接作为浏览器 LCP；但结合成功复测，足以确认网络波动会放大大文件问题。后续在用户常用网络上做浏览器冷启动/热启动与移动端采样，再决定是否调整公开资源的 CDN/域名分发。不要直接把未带版本的 JSON 长期 immutable 缓存，否则会影响文章更新。

### 5. 服务器与实现基线

腾讯云采样时 load average 为 0.27 / 0.07 / 0.02，3.7 GB 内存中约 2.8 GB 可用；当前快照未显示 CPU/内存压力。公开站实际使用 Cloudflare 静态快照，首页文章内容无需实时读取权威数据库。

线上仍为 classic 主题；本地存在未部署的界面差异与大量既有修改。体积与资源结论以上线文件为准，不能用本地 dist 的入口文件名代替线上文件名。

搜索目前已有 Worker 和分页，水纹/分类动画已有可见性暂停。因此本次不把重写搜索或删除视觉效果列为首轮动作。

## 验收方式

实施后应以相同网络、相同设备条件比较：首屏 JS/图片传输量、LCP、主线程长任务及回访耗时。首页请求中应不再出现 editor/Three.js/全库正文；正文、全文搜索和图库按需加载后保持功能完整。验证新文章发布后首页、列表、正文与搜索版本一致，保留腾讯云权威数据库及现有发布流程。

本次未取得浏览器 Performance/Lighthouse 的 LCP、INP、TBT 数据，不能将请求耗时解释为这些指标。浏览器页面可正常显示，采集到的控制台警告/错误为空。
