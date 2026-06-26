# StarfieldPage

> 源路径：`src/StarfieldPage.tsx`
> 总行数：约 1743 行

把已发布的文章"文段 + 关系"数据渲染成可漫游的三维银河星图的 Three.js 大型页面组件。

## 文件概览

`StarfieldPage` 是整个项目最复杂的可视化组件，挂在 `/starfield` 路由上（见 `src/routing.ts`）。它做的事情可以拆成三大块：1) 通过 `apiClient.ts` 的 `fetchPublicStarfield()` 拉取已发布星图数据（passages / relationships / deepPaths / version），按文章聚类生成 3D 坐标；2) 用 Three.js 搭建一个真正的"星系"场景——背景的银河尘埃、星核、旋臂粒子由自定义 shader 渲染，文段是可点击的发光精灵，关系是带脉冲动画的贝塞尔曲线；3) 提供一套类似 FPS 的相机控制（WASD 移动、右键拖拽转视角、滚轮调速、双击锁定跟踪），并配上一组 UI 面板（关系筛选、聚焦详情、深层路径）让读者从"漫游"切换到"结构化探索"。

整个文件大致分四个层次：顶层 `StarfieldPage` 函数组件负责状态和数据；`GalaxyViewport` 子组件持有 Three.js 实例和动画循环；一系列 `create*` 工厂函数负责生成几何体、材质、纹理；最后的纯函数负责坐标计算、随机种子、关系去重等。下面按这些层次逐块讲解。

## 顶层 StarfieldPage 与数据加载

`StarfieldPage` 是页面外壳，挂载时调 `fetchPublicStarfield()`。返回的 payload 包含 `passages`（文段，每段带 article、anchor、keywords、starSize 等）、`relationships`（关系，含 source/target passageId、relationshipType、strength、isCrossArticle）、`deepPaths`（深层路径，由多个 passageId 串联）、`version`（版本名）。状态机有四种：`loading` / `ready` / `empty` / `error`，每种对应不同的占位 UI。`empty` 表示星图还没发布（passages 为空），引导用户等待管理员发布。

```tsx
useEffect(() => {
  let cancelled = false;
  setStatus('loading');
  fetchPublicStarfield()
    .then((payload) => {
      if (cancelled) return;
      setPassages(payload.passages);
      setRelationships(payload.relationships);
      setDeepPaths(payload.deepPaths);
      setVersionName(payload.version?.name ?? '');
      setStatus(payload.passages.length > 0 ? 'ready' : 'empty');
    })
    .catch(() => { if (!cancelled) setStatus('error'); });
  return () => { cancelled = true; };
}, []);
```

派生数据用 `useMemo`：`colorMap` 把每个文章 category 映射到一种调色板颜色，`sceneData` 调 `createGalaxyScene` 生成最终的节点、边、质心。`focusPassage(id)` 是用户主动聚焦（点列表里的关系卡片），它会把 `activePassageId` 设上并递增 `focusRequest.nonce`，让子组件 `GalaxyViewport` 在收到新 nonce 时触发相机飞行。这种 nonce 机制是为了让"连续点击同一个 passage"也能再次触发飞行——只看 id 是做不到的。

## 状态机与页面骨架 UI

四种状态对应四种渲染。`ready` 时渲染完整工作区 `starfield-workspace`，包含 hero 头部（标题"银河星图"和回到文章列表的链接）、3D 视口、关系网面板、聚焦详情面板、左下角"当前聚焦"提示。`activePassage` 为真时给 workspace 加 `is-focused` class，让 CSS 知道当前处于聚焦态。

```tsx
{status === 'ready' && (
  <div className={`starfield-workspace ${activePassage ? 'is-focused' : ''}`}>
    <header className="starfield-hero">...</header>
    <GalaxyViewport data={sceneData} activePassageId={activePassageId} focusRequest={focusRequest}
      onPickPassage={setActivePassageId} relationshipNetwork={relationshipNetwork} />
    <RelationshipNetworkPanel filter={relationshipNetwork} relationships={relationships} onChange={setRelationshipNetwork} />
    <aside className="starfield-focus-panel">...</aside>
    {activePassage && <div className="starfield-inspector">...</div>}
  </div>
)}
```

`starfield-orientation-gate` 是给竖屏移动端的提示条："请横屏浏览星图"，因为星图的横向视野更宽。这并不强制旋转，只是建议。

## 聚焦详情与深层路径卡片

聚焦面板 `starfield-focus-panel` 显示当前选中 passage 的详细信息：分类、标题、摘要（优先 `excerpt`，缺省取 `text.slice(0, 140)`）、关键词（最多展示 4 个，多余显示 `+N`）。最关键的是"定位到原文"链接 `href={/posts/${slug}#${anchor}}`，它跳到文章详情页并通过 hash 锚点直接滚到对应段落——锚点的生成在 `src/MarkdownBody.md` 里详细说明，两者通过 `passage-id-*` / `passage-*` 的 anchor 字符串对齐。

```tsx
<a className="primary-action" href={`/posts/${activePassage.article.slug}#${activePassage.anchor}`}>
  定位到原文 <ExternalLink size={16} />
</a>
```

`related-stars-list` 列出两层信息：深层路径（`activeDeepPaths`，最多 4 条，按 strength 排序）和相关关系（`related`，最多 18 个）。深层路径卡片是星图的核心玩法——它把多个 passage 串成一条思考链，每条路径展示 `pathType`、强度、问题/理由，以及一系列可点击的步骤按钮，让用户沿路径在星图中"跳跃"。

```tsx
<article className="starfield-deep-path-card" key={path.id}>
  <span>{path.pathType} · 强度 {path.strength.toFixed(2)}</span>
  <strong>{path.title}</strong>
  <p>{path.inquiry.question || path.rationale}</p>
  <div>{path.passageIds.map((passageId, index) => (
    <button aria-current={passageId === activePassage.id ? 'step' : undefined}
      key={`${path.id}-${passageId}`} type="button"
      onClick={() => focusPassage(passageId)}>
      <small>{index + 1}</small><span>{step?.title ?? '未知星点'}</span>
    </button>
  ))}</div>
</article>
```

`getDeepPathsForPassage` 只保留包含当前 passageId 的路径并取前 4 条；`getRelatedStars` 则过滤出 source/target 中包含当前 passage 的关系，按"非 same_topic 优先 → 跨文章优先 → 强度高优先"排序，限制 18 条防止列表爆炸。

## RelationshipNetworkPanel 关系筛选

`RelationshipNetworkPanel` 是右下角的关系筛选面板，让用户按"关系类型"或"同一主题标签"激活对应星线。它把所有 relationships 聚合成 `{label, count}` 列表并按数量降序排，主题标签则只对 `relationshipType === 'same_topic'` 的关系提取（通过 `getRelationshipTopics` 从 `evidenceKeywords` 或 `rationale` 文本里抽取）。

```tsx
const relationshipTypes = useMemo(() => {
  const next = new Map<string, { label: string; count: number }>();
  relationships.forEach((relationship) => {
    const current = next.get(relationship.relationshipType);
    next.set(relationship.relationshipType, {
      label: relationship.relationshipLabel || relationshipTypeLabels[relationship.relationshipType] || relationship.relationshipType,
      count: (current?.count ?? 0) + 1,
    });
  });
  return Array.from(next.entries()).sort((left, right) => right[1].count - left[1].count || ...);
}, [relationships]);
```

`relationshipTypeLabels` 是内置的中文翻译表，覆盖 11 种关系类型（同一主题、前置知识、延伸阅读、问题与解法、对比关系等）。`toggleTopic` / `toggleRelationshipType` 把选中项加入或移出 filter 数组，并始终把 `showAllSameTopic` 重置为 false（用户主动选具体主题时不应再"全选 same_topic"）。

## GalaxyViewport 的状态与 ref

`GalaxyViewport` 是真正的 3D 渲染组件。它持有几十个 ref，分别保存 renderer、scene、camera、starGroup/edgeGroup/dustGroup、各种材质、raycaster、相机飞行/锁定状态、键位状态、相机角度等。这些 ref 在动画循环里被频繁读写，避免每帧重新创建对象。`useState` 只用在需要触发渲染的地方（如 `lockedPassageId`），其余都用 ref 减少 React 重渲染开销。

```tsx
const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
const sceneRef = useRef<THREE.Scene | null>(null);
const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
// ...
const cameraFlightRef = useRef<CameraFlight | null>(null);
const cameraLockRef = useRef<{ targetId: string; offset: THREE.Vector3 } | null>(null);
const focusPassageRef = useRef<(id: string, shouldLock?: boolean) => void>(() => undefined);
```

`focusPassageRef` 是个"反向注入"技巧：主 useEffect（创建 Three.js 场景的那个）把真正能驱动相机飞行的函数赋给它，外层 effect（监听 `focusRequest`）通过 `focusPassageRef.current(id, true)` 调用，避免把相机逻辑写在依赖 `focusRequest` 的 effect 里——那样会让整个 Three.js 场景在每次聚焦时重建。

## Three.js 场景初始化

主 useEffect（依赖 `[onPickPassage]`，实际只跑一次）创建 WebGLRenderer、Scene、PerspectiveCamera、灯光和三个 Group。Renderer 开了 `antialias`、`alpha`、`high-performance`，pixelRatio 上限 1.5 防止高 DPI 屏过度采样导致性能崩。Tone mapping 用 ACESFilmic，exposure 由 `GALAXY_BASELINE.exposure * tuning.exposure` 决定。Camera 是 42 度 FOV 的透视相机，初始位置在 (0, 330, 128) 俯视银河。

```tsx
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = GALAXY_BASELINE.exposure * tuningRef.current.exposure;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#02030a');
scene.fog = new THREE.FogExp2('#02030a', 0.00055);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2200);
camera.position.set(0, 330, 128);
```

三盏灯（`AmbientLight` + 两个 `PointLight`）给场景一点冷蓝 + 暖金的基调；`ResizeObserver` 监听容器尺寸变化时同步更新 renderer 尺寸和 camera aspect。

## 输入事件与相机控制

事件处理是这个组件最复杂的部分。`handleMove` 既负责鼠标 hover 检测（调 `pickPassage` 找到光标下的星点），又负责"右键拖拽转视角"——通过 `lookRef.active` 标志切换两种行为，yaw/pitch 增量按 0.003 弧度/像素累计，pitch 被 clamp 在 `±(π/2 - 0.08)` 防止视角翻转。`handleClick` 是左键单击（事件 button === 0），调用 pickPassage 选中星点；`handleDoubleClick` 则触发完整的相机飞行 + 锁定跟踪。

```tsx
const handleMove = (event: PointerEvent) => {
  // ...
  if (lookRef.current.active) {
    const dx = event.clientX - lookRef.current.lastX;
    const dy = event.clientY - lookRef.current.lastY;
    cameraAnglesRef.current.yaw -= dx * 0.003;
    cameraAnglesRef.current.pitch -= dy * 0.003;
    const pitchLimit = Math.PI / 2 - 0.08;
    cameraAnglesRef.current.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, cameraAnglesRef.current.pitch));
    return;
  }
  // hover detection ...
};
```

键盘事件监听 `keydown`/`keyup` 写入 `keysRef.current[code]`，但通过 `isTyping()` 判断当前焦点是否在 input/textarea/contenteditable 上——如果是就忽略，避免用户在评论框里打字时星图跟着移动。`handleWheel` 改的是 `movementSpeedMultiplierRef`（按 1.14 倍递增/递减，clamp 在 0.25~8），即"鼠标滚轮调速度"而不是"前后移动"，这种设计让长距离漫游更友好。

## 相机飞行与锁定跟踪

`startCameraFlightToPassage(id, shouldLock)` 是聚焦动画的入口。它先拿到目标 passage 的世界坐标（注意要通过 `starGroup.updateMatrixWorld()` 应用星系自转），算出当前视角方向，沿这个方向偏移 46 单位作为终点位置，避免飞行后视角突变。`cameraFlightRef` 保存起止位置、lookAt、duration（980ms）、targetId/offset；`cameraLockRef` 同时记录锁定目标，飞行结束后相机将持续跟踪被旋转的星点。

```tsx
const currentViewDirection = currentCamera.position.clone().sub(lookAt).normalize();
const targetOffset = currentViewDirection.multiplyScalar(46).add(new THREE.Vector3(0, 12, 0));
const toPosition = lookAt.clone().add(targetOffset);
cameraLockRef.current = shouldLock ? { targetId: id, offset: targetOffset.clone() } : null;
cameraFlightRef.current = { active: true, startedAt: performance.now(), duration: 980, fromPosition, toPosition, lookAt, targetId, targetOffset };
```

动画循环里处理三种相机状态：1) 用户主动移动（WASD）→ 取消飞行，按 forward/right 向量位移，速度受 Ctrl 加速和滚轮倍率影响；2) 飞行中 → 用 `easeInOutCubic` 缓动从 fromPosition 插值到 toPosition，每帧重新拿 `getPassageWorldPosition`（因为星系在转）；3) 锁定跟踪 → 相机位置 `lerp` 到 `lockedLookAt + offset`，offset 长度 clamp 在 18~180 防止过近/过远。三种状态互斥，优先级是"主动移动 > 飞行 > 锁定"。

```tsx
if (move.lengthSq() > 0) {
  cameraFlightRef.current = null;
  // ...
} else if (cameraFlightRef.current?.active) {
  const progress = Math.min(1, (now - flight.startedAt) / flight.duration);
  const eased = easeInOutCubic(progress);
  // ...
} else if (activeLock && lockedLookAt) {
  // locked tracking
} else {
  camera.lookAt(camera.position.clone().add(forward));
}
```

## 动画循环：星点脉冲与关系线

每帧除了更新相机，还要更新两类视觉元素。星点精灵（sprite）的尺寸和透明度根据"是否被选中、是否被 hover、距离当前焦点的远近、脉冲相位"动态计算——`pulse = 1 + sin(time * 80 + seed * 2π) * 0.08` 给每个星点独立的轻微脉动；选中态 scale 放大到 1.55 倍，hover 放大 1.25 倍。`pickMesh`（不可见的拾取球）始终保持 3.8 单位，让点击区域比视觉范围大一些，方便用户点中。

```tsx
data.nodes.forEach((node) => {
  if (!node.sprite) return;
  const selected = node.passage.id === activePassageIdRef.current;
  const hovered = node.passage.id === hoveredIdRef.current;
  const distanceToFocus = node.position.distanceTo(currentFocusRef.current);
  const pulse = 1 + Math.sin(time * 80 + Number(node.sprite.userData.seed ?? 0) * Math.PI * 2) * 0.08;
  const passageScale = (selected ? 1.55 : hovered ? 1.25 : GALAXY_BASELINE.passageSize) * liveTuning.passageSize;
  node.sprite.scale.setScalar(particleScale);
});
```

关系线的可见性由 `relationshipNetworkRef`（用户在面板选的筛选）和当前聚焦 passage 共同决定：`selectedByNetwork`（用户主动激活的关系类型/主题）或 `selectedByFocus`（连接当前聚焦星点的关系）。命中时把 shader uniform `uOpacity` 设为 0.82（聚焦命中）或 0.34（筛选命中），shader 内部再用 `sin(vLineDistance * 0.18 - uTime * 5.8)` 让光波沿着曲线流动。星系本身每帧旋转 0.00022 弧度，给整体一种缓慢自转的感觉。

## 场景数据组装 createGalaxyScene

`createGalaxyScene` 是把后端数据变成 3D 坐标的核心算法。它先按 `articleId` 把 passages 分组，每组算一个"文章中心位置"（调 `getGalaxyPosition`，按文章总数在银河旋臂上分布）；然后每个 passage 在自己的文章中心周围用 `getArticleClusteredPosition` 做小范围散布——这模拟真实星系里"同源恒星成团"的视觉。

```tsx
const articleCenters = new Map(
  articleIds.map((articleId, articleIndex) => [
    articleId,
    getGalaxyPosition(articleIndex, articleIds.length, 1.2 + Math.min(1.2, (articleGroups.get(articleId)?.length ?? 1) / 8)),
  ] as const),
);
// ...
const nodes: StarNode[] = passages.map((passage, index) => {
  const articleCenter = articleCenters.get(articleId) ?? getGalaxyPosition(index, passages.length, passage.starSize ?? 1);
  const position = getArticleClusteredPosition(articleCenter, cluster.index, cluster.total, index, passage.starSize ?? 1);
  return { passage, position, color, radius: 0.9 + (passage.starSize ?? 1) * 0.75 };
});
```

关系边经过 `dedupeRelationships` 去重（按 source/target 排序后拼 key），再按"跨文章优先 → 强度高优先"排序，这样绘制时跨文章的"主线"会盖在同文章的次要关系之上。最终返回 `GalaxySceneData`：nodes、nodesById（id → node 的查找表）、edges、centroid（所有节点的平均位置，作为相机初始 lookAt）。

## 银河坐标生成与随机种子

`getGalaxyPosition` 把一个序号映射到银河旋臂上的某个点。它使用四旋臂结构（`SHIYUN_GALAXY.BRANCHES = 4`），每个粒子按 `index % 4` 决定属于哪条旋臂，然后随径向距离 `t = radius / RADIUS` 累加旋转角（`SHIYUN_GALAXY.TWIST = 5.2`，让旋臂明显拧紧），叠加上 `gauss3`（三个 uniform 的和减 1.5，近似正态分布）带来的旋臂偏差和厚度抖动，最终输出 `(x, y, z)`。

```ts
function getGalaxyPosition(index: number, total: number, starSize: number) {
  const normalized = total > 1 ? index / (total - 1) : 0;
  const armIndex = index % SHIYUN_GALAXY.BRANCHES;
  const armOffset = (armIndex / SHIYUN_GALAXY.BRANCHES) * Math.PI * 2;
  // ...
  const radius = 24 + Math.pow(normalized, 0.82) * (SHIYUN_GALAXY.RADIUS * 0.72) + starSize * 1.8 + radialJitter;
  const t = radius / SHIYUN_GALAXY.RADIUS;
  const spin = armOffset + t * SHIYUN_GALAXY.TWIST + armDeviation + ...;
  return new THREE.Vector3(Math.cos(spin) * radius + ..., height + warp * 0.35, Math.sin(spin) * radius + ...);
}
```

`seededRandom(seed)` 是一个简陋的伪随机：`sin(seed * 12.9898) * 43758.5453` 取小数部分。这种实现虽然不是高质量的 PRNG，但对于"视觉散布"完全够用，而且是无状态的（同样 seed 永远得同样结果），保证刷新页面后星点位置稳定。`stableStringSeed` 用 FNV-1a 哈希把字符串（如 articleId）转成数字 seed，让同一篇文章的颜色和位置在多次渲染间一致。

## 背景银河粒子 createShiyunGalaxyBackdrop

这是视觉重头戏。函数生成三类粒子：dustCount（18000 个尘埃）、starCount（1400 个亮星）、bulgeCount（4200 个核球），总共 23600 个粒子塞进一个 BufferGeometry。粒子位置由 `expRadius`（指数分布的半径）、旋臂角度、`armProximity`（离旋臂中线的接近度，用高斯分布计算）共同决定；核球粒子用球面均匀分布而不是旋臂结构。

```ts
const dustCount = hi ? 18000 : 9000;
const starCount = hi ? 1400 : 700;
const bulgeCount = hi ? 4200 : 2400;
const total = dustCount + starCount + bulgeCount;
const rnd = mulberry32(31337); // 用更好的 PRNG，避免 sin hash 在大量粒子下出现明显条纹
```

每个粒子的颜色按"径向位置 t"在 `cCore`（核球黄白）→ `cInner` → `cMid`（蓝白）→ `cArm`（深蓝）之间插值；非核球粒子还会随机叠加星云色（金、紫、红、青），偶尔（9.5% 概率）变成 HII 区的粉红色 `#ff2f6f`，模拟真实星系里电离氢区的色调。亮度由 `armProximity` 和 `valueNoise`（一种基于 sin hash 的二维值噪声）共同调制，让旋臂有自然的明暗变化。

粒子的实际渲染由自定义 `ShaderMaterial` 完成。Vertex shader 用 `gl_PointSize = clamp(uSize * aScale * coreSize * (800.0 / -viewPosition.z), 0.34, 18.0)` 让远处粒子小、近处大，受 `aScale` 和 `aCore`（核球因子）调制；fragment shader 用高斯衰减 `exp(-d² * uSharpness)` 让每个点看起来像柔和的发光斑，并在核球位置压缩中心亮度避免过曝。

```glsl
// fragment shader 节选
float distanceFromCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
float alpha = exp(-distanceFromCenter * distanceFromCenter * uSharpness);
if (alpha < 0.004) discard;
float coreCompress = mix(1.0, 0.42, vCore);
gl_FragColor = vec4(vColor * alpha * uBrightness * coreCompress, alpha * mix(0.94, 0.58, vCore));
```

注释里写明配方改编自 Cohenjikan/shiyun 项目（MIT 许可），这是开发者诚实标注外部参考来源的体现。

## 关系曲线与脉冲材质

`createRelationshipCurveGeometry` 为每条关系生成一条二次贝塞尔曲线。控制点不是简单的中点，而是经过精心设计：径向方向（指向银河中心或外缘）偏移、垂直方向抬起、侧向随机偏移，让曲线在三维空间里优雅地"拱起"，避免多条关系重叠成直线。每条曲线的种子来自 relationship id 和两端 passage id，所以同一条关系每次刷新都长得一样。

```ts
const outwardBend = THREE.MathUtils.clamp(distance * 0.18, 8, 34);
const verticalLift = THREE.MathUtils.clamp(distance * (0.07 + seededRandom(seed + 13) * 0.06), 5, 24);
const sideBend = (seededRandom(seed + 29) - 0.5) * THREE.MathUtils.clamp(distance * 0.18, 5, 24);
const control = midpoint.clone()
  .add(radialDirection.multiplyScalar(outwardBend * bendSign))
  .add(sideDirection.multiplyScalar(sideBend))
  .add(new THREE.Vector3(0, verticalLift, 0));
```

曲线的 `lineDistance` 属性存累计弧长，传给 shader 的 `vLineDistance`，让 fragment 用 `sin(vLineDistance * 0.18 - uTime * 5.8)` 让一道光波沿曲线流动——这就是星图上"星线流光"的视觉效果。alpha 由 `uOpacity * (0.42 + pulse * 0.72)` 决定，被聚焦时 uOpacity=0.82 显眼，被筛选激活时 uOpacity=0.34 较弱。

## 拾取算法 pickPassage

`pickPassage` 实现了一种"屏幕空间圆形命中"的拾取。它不用 Three.js 自带的 raycaster intersect（那对粒子/Sprite 不友好），而是把每个 sprite 的世界坐标 project 到 NDC 空间，计算与光标点的 2D 距离，如果小于根据 sprite 屏幕尺寸算出的 `hitRadius`（clamp 在 0.045~0.18 NDC 单位）就算命中。多个候选中取最近的。

```ts
const visibleRadius = Math.max(item.sprite.scale.x, item.sprite.scale.y, item.mesh.geometry.boundingSphere?.radius ?? 1) * 0.62;
projectedEdge.copy(worldPosition).addScaledVector(cameraRight, visibleRadius).project(camera);
const projectedRadius = Math.hypot(projectedEdge.x - projected.x, projectedEdge.y - projected.y);
const hitRadius = THREE.MathUtils.clamp(projectedRadius * 1.9, 0.045, 0.18);
const distance = Math.hypot(projected.x - pointer.x, projected.y - pointer.y);
if (distance <= hitRadius && distance < nearestDistance) { /* 命中 */ }
```

只有当圆形命中失败时，才回退到 raycaster intersect 不可见的 pickMesh（球体）作为兜底。这种"双保险"既保证可视区域容易点中，又保证极端情况下（精灵极小或被遮挡）仍能拾取到。

## 纹理与配色辅助

`softGlowTexture` 用 canvas 绘制一个径向渐变的白光斑（中心 0.95 alpha → 边缘 0），缓存到模块级变量 `cachedSoftGlowTexture`，避免每个 sprite 都重建纹理。`createGlowTexture(color)` 类似但接受颜色参数，用于背景星的 `PointsMaterial.map`。`createShiyunStarDome` 在半径 2200 的远景球面上撒 1400 个白星点作为"星空背景穹顶"，让银河看起来真的漂浮在深空中。

```ts
let cachedSoftGlowTexture: THREE.Texture | null = null;
function softGlowTexture() {
  if (cachedSoftGlowTexture) return cachedSoftGlowTexture;
  // ... canvas 绘制 ...
  cachedSoftGlowTexture = new THREE.CanvasTexture(canvas);
  return cachedSoftGlowTexture;
}
```

`getGalaxyParticleColor(seed)` 按种子在六色调色板（蓝、金、紫、红、青、粉）之间挑选并混合，让文章星点的颜色与背景银河的色调呼应但又有差异，保证可识别性。`applyGalaxyTuning` 把 baseline 参数乘以 tuning 系数写入各材质的 uniform，是动态调整视觉强度的统一入口——目前 tuning 是固定常量 `DEFAULT_GALAXY_TUNING`，但接口已经为未来"用户可调"留出空间。

## 移动端控制与清理

考虑到移动端没有键盘，组件渲染了一组虚拟方向键 `starfield-mobile-controls`（W/A/S/D 四个按钮），通过 `setVirtualKey(code, true/false)` 写入 `keysRef.current`，让动画循环把它们当成真实键盘事件处理。按钮用 pointer 事件并尝试 `setPointerCapture`，保证手指拖出按钮区域时仍能持续触发。`releaseVirtualKeys` 在 `pointerup`/`pointercancel`/`blur` 时清空所有虚拟键，避免"按住后切后台导致一直前进"。

```tsx
{[['KeyW', '前进', 'W'], ['KeyA', '左移', 'A'], ['KeyS', '后退', 'S'], ['KeyD', '右移', 'D']].map(([code, label, key]) => (
  <button aria-label={label} className={`starfield-mobile-key is-${key.toLowerCase()}`} key={code} type="button"
    onPointerDown={(event) => { event.preventDefault(); setVirtualKey(code, true); /* ... */ }}
    onPointerUp={() => setVirtualKey(code, false)}>
    {key}
  </button>
))}
```

主 useEffect 的 cleanup 函数会取消 `requestAnimationFrame`、移除所有事件监听、断开 `ResizeObserver`、从 DOM 移除 canvas、调用 `renderer.dispose()`，并遍历 scene 释放所有 geometry 和 material。这是 Three.js 长生命周期组件必备的资源回收——如果不做，单页应用切换路由会导致 WebGL 上下文累积泄漏。同样，第二个 useEffect（依赖 `[data]`）在星图数据更新时会清空三个 Group 并重新填充，旧节点引用置 undefined 让 GC 能回收。
