import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, FileText, Image as ImageIcon, Plus, Settings, SquareTerminal, Sun } from 'lucide-react';
import { fetchAdminOps, type ApiAdminOps } from './apiClient';
import type { SiteContent } from './contentStore';
import type { Post } from './posts';
import type { ColorScheme } from './siteSettings';

type AdminPanelId =
  | 'overview'
  | 'posts'
  | 'trash'
  | 'comments'
  | 'notes'
  | 'series'
  | 'gallery'
  | 'archive'
  | 'commands'
  | 'homepage'
  | 'appearance';

type ArchiveGroup = {
  month: string;
  entries: Post[];
};

export function AdminDashboardPanel({
  archiveGroups,
  colorScheme,
  content,
  deletedPosts,
  onSelectPanel,
}: {
  archiveGroups: ArchiveGroup[];
  colorScheme: ColorScheme;
  content: SiteContent;
  deletedPosts: Post[];
  onSelectPanel: (panel: AdminPanelId) => void;
}) {
  const sortedPosts = sortPosts(content.posts);
  const latestPosts = sortedPosts.slice(0, 5);
  const categories = Array.from(new Set(content.posts.map((post) => post.category).filter(Boolean)));
  const galleryImageCount = content.galleryAlbums.reduce((total, album) => total + album.imageCount, 0);
  const unsyncedPostCount = content.posts.filter((post) => post.syncStatus === 'local-only').length;
  const [ops, setOps] = useState<ApiAdminOps | null>(null);
  const [opsStatus, setOpsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const quickActions: Array<{ label: string; detail: string; panel: AdminPanelId; icon: ReactNode }> = [
    { label: '整理文章', detail: '搜索、预览、编辑和删除', panel: 'posts', icon: <FileText size={18} /> },
    { label: '维护图库', detail: `${content.galleryAlbums.length} 个相册，${galleryImageCount} 张图片`, panel: 'gallery', icon: <ImageIcon size={18} /> },
    { label: '快速指令', detail: '管理员指令通道框架', panel: 'commands', icon: <SquareTerminal size={18} /> },
    { label: '更新首页', detail: '标题、按钮、关于和今日小记', panel: 'homepage', icon: <Settings size={18} /> },
    { label: '调整外观', detail: colorScheme === 'light' ? '当前亮色模式' : '当前暗色模式', panel: 'appearance', icon: <Sun size={18} /> },
  ];

  useEffect(() => {
    let cancelled = false;
    setOpsStatus('loading');
    fetchAdminOps()
      .then((payload) => {
        if (!cancelled) {
          setOps(payload);
          setOpsStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpsStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="admin-panel admin-dashboard" aria-label="管理总览">
      <header className="panel-header">
        <h2>总览</h2>
        <a className="primary-action" href="/admin/posts/new">
          <Plus size={17} />
          创建文章
        </a>
      </header>

      <div className="admin-dashboard-grid">
        <div className="admin-stat-card">
          <span>文章</span>
          <strong>{content.posts.length}</strong>
          <small>{categories.length} 个分类</small>
        </div>
        <div className="admin-stat-card">
          <span>专题</span>
          <strong>{content.featuredSeries.length}</strong>
          <small>{content.featuredSeries.reduce((total, series) => total + series.postSlugs.length, 0)} 篇已编排</small>
        </div>
        <div className="admin-stat-card">
          <span>图库</span>
          <strong>{galleryImageCount}</strong>
          <small>{content.galleryAlbums.length} 个相册</small>
        </div>
        <div className="admin-stat-card">
          <span>归档</span>
          <strong>{archiveGroups.length}</strong>
          <small>{deletedPosts.length} 篇在回收站</small>
        </div>
        <div className="admin-stat-card">
          <span>待处理</span>
          <strong>{ops?.pendingComments ?? 0}</strong>
          <small>{unsyncedPostCount} 篇未同步稿</small>
        </div>
      </div>

      <div className="admin-dashboard-main">
        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-header">
            <div>
              <span>快捷入口</span>
              <h3>常用工作</h3>
            </div>
          </div>
          <div className="admin-quick-grid">
            {quickActions.map((action) => (
              <button key={action.panel} type="button" onClick={() => onSelectPanel(action.panel)}>
                {action.icon}
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-header">
            <div>
              <span>运维状态</span>
              <h3>{opsStatus === 'ready' ? '服务正常' : opsStatus === 'loading' ? '检查中' : '检查失败'}</h3>
            </div>
          </div>
          <div className="admin-ops-list">
            <div>
              <strong>API</strong>
              <small>{ops?.api?.ok ? `正常 · ${formatDateTime(ops.api.timestamp ?? '')}` : '无法确认'}</small>
            </div>
            <div>
              <strong>数据库</strong>
              <small>{ops?.database?.ok ? `quick_check: ${ops.database.quickCheck}` : '无法确认'}</small>
            </div>
            <div>
              <strong>数据文件</strong>
              <small>{formatBytes(ops?.database?.sizeBytes ?? 0)}</small>
            </div>
          </div>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-header">
            <div>
              <span>最近文章</span>
              <h3>{latestPosts.length > 0 ? '最新更新' : '还没有文章'}</h3>
            </div>
            <button className="secondary-action" type="button" onClick={() => onSelectPanel('posts')}>
              全部文章
            </button>
          </div>
          <div className="admin-recent-list">
            {latestPosts.length > 0 ? (
              latestPosts.map((post) => (
                <a href={`/admin/posts/${post.slug}/edit`} key={post.slug}>
                  <span>{post.category || '未分类'}</span>
                  <strong>{post.title}</strong>
                  <small>{post.date}</small>
                </a>
              ))
            ) : (
              <p className="empty-state">先创建第一篇文章。</p>
            )}
          </div>
        </section>
        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-header">
            <div>
              <span>审计日志</span>
              <h3>{ops?.recentAudit?.length ? '最近操作' : '暂无记录'}</h3>
            </div>
          </div>
          <div className="admin-recent-list admin-audit-list">
            {ops?.recentAudit?.length ? (
              ops.recentAudit.slice(0, 5).map((entry) => (
                <div key={entry.id ?? `${entry.action}-${entry.createdAt}`}>
                  <span>{entry.action}</span>
                  <strong>{entry.target}</strong>
                  <small>{formatDateTime(entry.createdAt ?? '')}</small>
                </div>
              ))
            ) : (
              <p className="empty-state">成功的后台写操作会记录在这里。</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function sortPosts(posts: Post[]) {
  return [...posts].sort((firstPost, secondPost) => parsePostDate(secondPost.date) - parsePostDate(firstPost.date));
}

function parsePostDate(date: string) {
  const [datePart = '', timePart = '00:00'] = date.trim().split(/\s+/);
  const [year = '0', month = '1', day = '1'] = datePart.split('.');
  const [hour = '0', minute = '0'] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
