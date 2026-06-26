# PublicGalleryPage

> 源路径：`src/PublicGalleryPage.tsx`
> 总行数：约 294 行

面向读者的"公开相册浏览页"：以可展开的相册列表呈现，每个相册按 24 张/页分页加载图片，并提供灯箱查看大图。

## 文件概览

`PublicGalleryPage` 是 `/gallery` 路由的页面组件（路由定义见 `src/routing.ts`）。它接收一组相册 `albums`（由上层 `App.tsx` 从 `contentStore.ts` 注入），先过滤出"公开"且"非系统相册"的项（系统相册是头像、hero 图这类站点资源，不应出现在读者图库里），再按 sortOrder 排序。每个相册默认折叠，点击展开后有两种数据来源：本地相册（包含 `images` 字段）→ 直接分页；远程相册（只有 `imageCount`）→ 调 `apiClient.ts` 的 `fetchPublicGalleryAlbumImages` 按页拉取。点击单张图片会弹出全屏灯箱，支持上一张/下一张导航。

## 组件状态与展开逻辑

组件持有几个核心 state：`expandedAlbumSlug`（当前展开哪个相册）、`pageByAlbumSlug`（每个相册当前在第几页）、`remoteImagesByAlbumSlug`（远程分页结果的缓存）、`activeImageIndex`（灯箱当前图片索引）。`publicAlbums` 经过 `useMemo` 过滤排序；`activeAlbum` 是当前展开相册的引用，`activeAlbumLocalImages` 把它的公开图片排好序。`hasLocalImages` 决定走"本地分页"还是"远程拉取"两条路径之一。

```tsx
const publicAlbums = useMemo(
  () => sortGalleryAlbums(albums).filter((album) => album.isPublic && !isSystemGalleryAlbum(album)),
  [albums],
);
const [expandedAlbumSlug, setExpandedAlbumSlug] = useState('');
// ...
const images = hasLocalImages
  ? activeAlbumLocalImages.slice((activeAlbumPage - 1) * galleryPageSize, activeAlbumPage * galleryPageSize)
  : remotePage?.images ?? [];
const pageCount = hasLocalImages ? localPageCount : remotePage?.pageCount ?? 1;
```

`useEffect` 还有一段防御：如果展开的 slug 不再出现在 `publicAlbums` 里（例如管理员把它设为私有），就自动收起，避免显示一个不存在的相册。

## 远程分页加载

对于远程相册（`hasLocalImages === false`），useEffect 监听 `[activeAlbum, activeAlbumPage, hasLocalImages]`，调 `fetchPublicGalleryAlbumImages(activeAlbum.id || activeAlbum.slug, {page, pageSize: 24})`。这里有一个缓存检查：如果当前页正在加载、已经有图、有错误或 total 为 0（即空相册），就跳过重复请求。

```tsx
fetchPublicGalleryAlbumImages(activeAlbum.id || activeAlbum.slug, {
  page: activeAlbumPage,
  pageSize: galleryPageSize,
})
  .then((payload) => {
    const nextImages = payload.items
      .map(normalizeApiGalleryImage)
      .filter((image): image is GalleryImage => image !== null);
    setRemoteImagesByAlbumSlug((currentPages) => ({
      ...currentPages,
      [activeAlbum.slug]: { images: nextImages, page: payload.page, pageCount: payload.pageCount, total: payload.total, isLoading: false, error: '' },
    }));
  })
  .catch(() => { /* 显示"图片加载失败" */ });
```

`normalizeApiGalleryImage` 来自 `apiClient.ts`，把后端返回的图片对象规范化为前端类型 `GalleryImage`；不可识别的项被 `filter` 掉，保证渲染时不会因为脏数据崩溃。`cancelled` 标志位防止快速切换相册时的旧请求覆盖新结果。

## 灯箱与导航

`activeImageIndex` 是 number 或 null，null 时灯箱不渲染。点击单张图片 `setActiveImageIndex(index)` 打开灯箱。`moveLightbox(direction)` 做环形导航：`(activeImageIndex + direction + images.length) % images.length`，到末尾再按"下一张"会跳回首张。灯箱用 `role="dialog" aria-modal="true"` 标注为模态对话框，并配有 `X` 关闭按钮和左右导航按钮（只在图片多于 1 张时显示）。

```tsx
function moveLightbox(direction: -1 | 1) {
  if (activeImageIndex === null || images.length === 0) return;
  setActiveImageIndex((activeImageIndex + direction + images.length) % images.length);
}
```

切换相册或翻页时 `setActiveImageIndex(null)` 强制关闭灯箱，避免用户在 A 相册第 3 张打开灯箱后翻到 B 相册看到错位的图片。

## 辅助函数

`sortGalleryAlbums` / `sortGalleryImages` 都按 `sortOrder` 升序、标题 `localeCompare` 作为次要排序，保证展示顺序稳定。`isSystemGalleryAlbum` 用 `systemGalleryAlbumId`（`'album-moonlight'`）和 `systemGalleryAlbumSlug`（`'system'`）双重判断——这两个常量在 `contentStore.ts` 中导出，含义是"博主身份相关图片组成的虚拟相册"，不应被读者看到。`formatGalleryTime` 用 `Intl.DateTimeFormat('zh-CN', ...)` 格式化拍摄时间，无效时显示"时间未知"。

`GalleryPagination` 是页面底部的分页条，用"上一页/下一页"加"X / Y"显示，按钮根据当前页禁用，简单可靠。

```tsx
<nav className="gallery-pagination" aria-label="图库分页">
  <button className="secondary-action" type="button" onClick={onPrevious} disabled={page <= 1}>上一页</button>
  <span>{page} / {pageCount}</span>
  <button className="secondary-action" type="button" onClick={onNext} disabled={page >= pageCount}>下一页</button>
</nav>
```
