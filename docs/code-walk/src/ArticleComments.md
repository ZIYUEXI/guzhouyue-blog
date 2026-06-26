# ArticleComments

> 源路径：`src/ArticleComments.tsx`
> 总行数：约 189 行

文章详情页底部的评论组件：展示评论列表 + 提交新评论，支持本地兜底与提交后的"待审核"提示。

## 文件概览

这是面向读者的公开评论入口。组件接收一个 `slug`，挂载时通过 `apiClient.ts` 的 `fetchArticleComments` 拉取该文章已审核的评论并渲染；用户填写昵称 + 内容后通过 `submitArticleComment` 提交，提交成功则乐观插入到列表顶部。它特别的地方是带"离线降级"：API 出错时，先把评论临时保存到本机 localStorage（key 形如 `guzhouyue-comments:<slug>`），并明确提示"尚未公开提交"，让用户知道自己写的东西没丢。整体风格是简洁的折叠面板，避免在文章页抢主视觉。

## 状态与生命周期

组件持有 `comments`、`author`、`content`、`isExpanded`、`notice` 五个 state。初始值从本地缓存读出来，让首屏立即有内容；`useEffect` 依赖 `[slug]`，slug 一变就重新拉接口、重置展开状态和通知——这是为了支持单页应用里文章之间无缝切换不会显示旧评论。

```tsx
export function ArticleComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<CommentItem[]>(() => readPostComments(slug));
  // ...
  useEffect(() => {
    let cancelled = false;
    async function loadComments() {
      try {
        const apiComments = await fetchArticleComments(slug);
        if (!cancelled) {
          setComments(apiComments);
          savePostComments(slug, apiComments);
        }
      } catch {
        if (!cancelled) {
          setComments(readPostComments(slug));
        }
      }
    }
    loadComments();
    // ...
    return () => { cancelled = true; };
  }, [slug]);
```

`cancelled` 标志位是常见的请求竞态保护：组件卸载或 slug 切换时，迟到的响应不会去 setState。`savePostComments(slug, apiComments)` 同步把接口结果写回 localStorage，下次进来直接读到最新数据。

## 提交逻辑与离线兜底

`submitComment` 是表单的 onSubmit 处理器。它先 `preventDefault` 阻止原生提交，再 trim 内容（空内容直接返回，不发请求）。提交成功有两种语义：后端返回了已保存的评论对象 → 立刻加到列表顶；或后端表示"已收，待审"（返回 null/undefined）→ 显示"评论已提交，审核后展示。"。两种情况下都会清空表单。

```tsx
const savedComment = await submitArticleComment(slug, {
  authorName: author.trim() || '过路读者',
  content: trimmedContent,
});
if (savedComment) {
  const nextComments = [savedComment, ...comments];
  setComments(nextComments);
  savePostComments(slug, nextComments);
} else {
  setNotice('评论已提交，审核后展示。');
}
```

异常分支体现了降级策略：本地拼一个临时评论（id 用 `Date.now()` 当占位），写进 state 和 localStorage，并通过 `notice` 明确告知"接口暂不可用，已临时保存到本机，尚未公开提交"。这是为了让读者在弱网或后端临时不可用时不会"白写一段话"。

## localStorage 序列化与时间格式化

`readPostComments` 严格校验每条记录的字段类型，过滤掉脏数据；数组本身不是数组就直接返回 `[]`，JSON 解析出错也走 catch 退回空数组。这种"宽容读取"很重要，因为本地存储可能被其他工具或旧版本写入过。

```ts
return parsedComments.filter((comment): comment is CommentItem => {
  return (
    typeof comment?.id === 'string' &&
    typeof comment.author === 'string' &&
    typeof comment.content === 'string' &&
    typeof comment.createdAt === 'string'
  );
});
```

`formatCommentTime` 用 `Intl.DateTimeFormat('zh-CN', ...)` 输出"2025年6月25日 14:30"这类格式，无效日期显示"时间未知"。注意 `CommentItem.createdAt` 是 ISO 字符串（来自后端或 `new Date().toISOString()`），列表用 `<time dateTime={comment.createdAt}>` 同时给出机器可读和人类可读两种格式，方便搜索引擎和辅助技术解析。

## UI 结构

整个组件根元素是 `<section class="article-comments" aria-label="评论">`。顶部头有评论数（粗体）和展开/收起按钮，使用 `aria-expanded` 和 `aria-controls` 让屏幕阅读器知道控制关系。展开后的面板包含一个昵称输入框（默认昵称"过路读者"）、一个 4 行的 textarea、一个带 `Send` 图标的提交按钮，以及下方的评论列表或"还没有评论"的空状态。空评论列表用 `comment-empty` 类显示提示文案，让读者知道这里是评论区而不是页面结束。
