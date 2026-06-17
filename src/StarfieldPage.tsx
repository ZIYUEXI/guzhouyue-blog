import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, Loader2, Orbit, Search } from 'lucide-react';
import { fetchPublicStarfield, type ApiStarfieldPassage, type ApiStarfieldRelationship } from './apiClient';

const categoryColors = ['#f7c948', '#59c3c3', '#f45b69', '#7f95d1', '#9bc53d', '#ff9f1c', '#c77dff'];

export function StarfieldPage() {
  const [passages, setPassages] = useState<ApiStarfieldPassage[]>([]);
  const [relationships, setRelationships] = useState<ApiStarfieldRelationship[]>([]);
  const [versionName, setVersionName] = useState('');
  const [activePassageId, setActivePassageId] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchPublicStarfield()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setPassages(payload.passages);
        setRelationships(payload.relationships);
        setVersionName(payload.version?.name ?? '');
        setStatus(payload.passages.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const layout = useMemo(() => createStarLayout(passages), [passages]);
  const categories = useMemo(() => Array.from(new Set(passages.map((passage) => passage.article.category || '未分类'))), [passages]);
  const colorMap = useMemo(
    () => Object.fromEntries(categories.map((category, index) => [category, categoryColors[index % categoryColors.length]])),
    [categories],
  );
  const activePassage = passages.find((passage) => passage.id === activePassageId) ?? null;
  const related = useMemo(
    () => getRelatedStars(activePassageId, passages, relationships),
    [activePassageId, passages, relationships],
  );

  return (
    <section className="starfield-page" aria-label="星图">
      <header className="starfield-hero">
        <div>
          <span>Starfield</span>
          <h1>星空知识地图</h1>
          <p>从文章文段出发，沿着跨文章关系探索知识之间的暗线。</p>
        </div>
        <a className="secondary-action" href="/posts/page/1">
          <Search size={17} />
          回到文章列表
        </a>
      </header>

      {status === 'loading' && (
        <div className="starfield-empty">
          <Loader2 size={22} />
          <p>正在载入星图。</p>
        </div>
      )}

      {status === 'error' && (
        <div className="starfield-empty">
          <p>星图接口暂时不可用。</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="starfield-empty">
          <Orbit size={26} />
          <h2>星图还没有发布</h2>
          <p>管理员发布 Published Starfield 后，读者就能在这里探索文章文段之间的关系。</p>
        </div>
      )}

      {status === 'ready' && (
        <div className={`starfield-workspace ${activePassage ? 'is-focused' : ''}`}>
          <div className="starfield-map" aria-label={versionName || '已发布星图'}>
            <div className="starfield-backdrop" />
            {relationships.map((relationship) => {
              const source = layout[relationship.sourcePassageId];
              const target = layout[relationship.targetPassageId];
              if (!source || !target) {
                return null;
              }
              const isActive = activePassageId && (relationship.sourcePassageId === activePassageId || relationship.targetPassageId === activePassageId);
              return (
                <span
                  className={`starfield-link ${isActive ? 'is-active' : ''}`}
                  key={relationship.id}
                  style={lineStyle(source, target)}
                  title={`${relationship.relationshipLabel}：${relationship.rationale}`}
                />
              );
            })}
            {passages.map((passage) => {
              const point = layout[passage.id];
              const color = colorMap[passage.article.category || '未分类'];
              return (
                <button
                  className={`starfield-star ${activePassageId === passage.id ? 'is-active' : ''}`}
                  key={passage.id}
                  style={{
                    left: `${point?.x ?? 50}%`,
                    top: `${point?.y ?? 50}%`,
                    '--star-color': color,
                    '--star-scale': passage.starSize ?? 1,
                  } as React.CSSProperties}
                  type="button"
                  onClick={() => setActivePassageId(passage.id)}
                >
                  <span />
                  <strong>{passage.title}</strong>
                </button>
              );
            })}
          </div>

          <aside className="starfield-focus-panel" aria-label="星点详情">
            {activePassage ? (
              <>
                <span>{activePassage.article.category}</span>
                <h2>{activePassage.title}</h2>
                <p>{activePassage.excerpt || activePassage.text.slice(0, 160)}</p>
                <div className="starfield-keywords">
                  {activePassage.keywords.map((keyword) => (
                    <small key={keyword}>{keyword}</small>
                  ))}
                </div>
                <a className="primary-action" href={`/posts/${activePassage.article.slug}#${activePassage.anchor}`}>
                  定位到原文
                  <ExternalLink size={16} />
                </a>
                <div className="related-stars-list">
                  <h3>相关星点</h3>
                  {related.length > 0 ? (
                    related.map(({ passage, relationship }) => (
                      <button key={`${relationship.id}-${passage.id}`} type="button" onClick={() => setActivePassageId(passage.id)}>
                        <span>{relationship.relationshipLabel}</span>
                        <strong>{passage.title}</strong>
                        <small>{relationship.rationale}</small>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <p>这个星点暂时没有已审核关系。</p>
                  )}
                </div>
              </>
            ) : (
              <div className="starfield-guide">
                <Orbit size={28} />
                <h2>点击任意星点</h2>
                <p>视角会聚焦到该文段，并显示跨文章优先的相关星点和关系说明。</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function createStarLayout(passages: ApiStarfieldPassage[]) {
  const total = Math.max(1, passages.length);
  return Object.fromEntries(
    passages.map((passage, index) => {
      const angle = index * 2.399963;
      const radius = 8 + (Math.sqrt(index + 1) / Math.sqrt(total)) * 39;
      return [
        passage.id,
        {
          x: 50 + Math.cos(angle) * radius,
          y: 50 + Math.sin(angle) * radius,
        },
      ];
    }),
  );
}

function lineStyle(source: { x: number; y: number }, target: { x: number; y: number }) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    left: `${source.x}%`,
    top: `${source.y}%`,
    width: `${length}%`,
    transform: `rotate(${angle}deg)`,
  };
}

function getRelatedStars(activeId: string, passages: ApiStarfieldPassage[], relationships: ApiStarfieldRelationship[]) {
  if (!activeId) {
    return [];
  }
  return relationships
    .filter((relationship) => relationship.sourcePassageId === activeId || relationship.targetPassageId === activeId)
    .sort((left, right) => Number(right.isCrossArticle) - Number(left.isCrossArticle) || right.strength - left.strength)
    .slice(0, 9)
    .map((relationship) => {
      const relatedId = relationship.sourcePassageId === activeId ? relationship.targetPassageId : relationship.sourcePassageId;
      const passage = passages.find((item) => item.id === relatedId);
      return passage ? { passage, relationship } : null;
    })
    .filter((item): item is { passage: ApiStarfieldPassage; relationship: ApiStarfieldRelationship } => item !== null);
}
