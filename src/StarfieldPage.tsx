import { ChevronRight, ExternalLink, Loader2, Network, Orbit, Search, Unlock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fetchPublicStarfield, type ApiStarfieldDeepPath, type ApiStarfieldPassage, type ApiStarfieldRelationship } from './apiClient';

const categoryColors = ['#ffd65a', '#68d7ff', '#ff6f91', '#9aa7ff', '#9ee55b', '#ff9f43', '#c77dff'];

const SHIYUN_GALAXY = {
  RADIUS: 185,
  BRANCHES: 4,
  TWIST: 5.2,
  ARM_SPREAD: 0.42,
  THICKNESS: 0.11,
};

const GALAXY_BASELINE = {
  exposure: 0.98,
  particleBrightness: 1.82,
  particleSize: 1.82,
  particleSharpness: 9.4,
  domeBrightness: 0.74,
  domeSize: 5.8,
  passageBrightness: 0.42,
  passageSize: 0.74,
};

const DEFAULT_GALAXY_TUNING = {
  exposure: 3,
  particleBrightness: 1.96,
  particleSize: 2.32,
  particleSharpness: 2.23,
  domeBrightness: 1.96,
  domeSize: 1,
  passageBrightness: 1.43,
  passageSize: 2.5,
};

type StarNode = {
  passage: ApiStarfieldPassage;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  sprite?: THREE.Sprite;
  pickMesh?: THREE.Mesh;
};

type StarEdge = {
  relationship: ApiStarfieldRelationship;
  source: StarNode;
  target: StarNode;
};

type GalaxySceneData = {
  label: string;
  nodes: StarNode[];
  nodesById: Map<string, StarNode>;
  edges: StarEdge[];
  centroid: THREE.Vector3;
};

type GalaxyTuning = typeof DEFAULT_GALAXY_TUNING;
type RelationshipNetworkFilter = {
  showAllSameTopic: boolean;
  topics: string[];
  relationshipTypes: string[];
};
type FocusRequest = {
  id: string;
  nonce: number;
};
type CameraFlight = {
  active: boolean;
  startedAt: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  lookAt: THREE.Vector3;
  targetId?: string;
  targetOffset?: THREE.Vector3;
};

export function StarfieldPage() {
  const [passages, setPassages] = useState<ApiStarfieldPassage[]>([]);
  const [relationships, setRelationships] = useState<ApiStarfieldRelationship[]>([]);
  const [deepPaths, setDeepPaths] = useState<ApiStarfieldDeepPath[]>([]);
  const [versionName, setVersionName] = useState('');
  const [activePassageId, setActivePassageId] = useState('');
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [relationshipNetwork, setRelationshipNetwork] = useState<RelationshipNetworkFilter>({
    showAllSameTopic: false,
    topics: [],
    relationshipTypes: [],
  });

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
        setDeepPaths(payload.deepPaths);
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

  const colorMap = useMemo(() => {
    const categories = Array.from(new Set(passages.map((passage) => passage.article.category || '未分类')));
    return Object.fromEntries(categories.map((category, index) => [category, categoryColors[index % categoryColors.length]]));
  }, [passages]);

  const sceneData = useMemo(() => createGalaxyScene(passages, relationships, colorMap), [colorMap, passages, relationships]);
  const activePassage = passages.find((passage) => passage.id === activePassageId) ?? null;
  const related = useMemo(() => getRelatedStars(activePassageId, passages, relationships), [activePassageId, passages, relationships]);
  const activeDeepPaths = useMemo(() => getDeepPathsForPassage(activePassageId, deepPaths), [activePassageId, deepPaths]);
  const focusPassage = (id: string) => {
    setActivePassageId(id);
    setFocusRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  };
  const clearFocus = () => {
    setActivePassageId('');
    setFocusRequest(null);
  };

  return (
    <section className="starfield-page" aria-label="星图">
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
          <header className="starfield-hero">
            <div>
              <span>Starfield</span>
              <h1>银河星图</h1>
              <p>从文章文段出发，沿着跨文章关系，在三维银河里查看知识的聚合与牵引。</p>
            </div>
            <a className="secondary-action" href="/posts/page/1">
              <Search size={17} />
              回到文章列表
            </a>
          </header>

          <GalaxyViewport
            data={sceneData}
            activePassageId={activePassageId}
            focusRequest={focusRequest}
            onPickPassage={setActivePassageId}
            relationshipNetwork={relationshipNetwork}
          />

          <RelationshipNetworkPanel filter={relationshipNetwork} relationships={relationships} onChange={setRelationshipNetwork} />

          <aside className="starfield-focus-panel" aria-label="星点详情">
            {activePassage ? (
              <>
                <div className="starfield-focus-head">
                  <span>{activePassage.article.category}</span>
                  <button className="secondary-action starfield-focus-clear" type="button" onClick={clearFocus}>
                    <X size={14} />
                    取消聚焦
                  </button>
                </div>
                <h2>{activePassage.title}</h2>
                <p className="starfield-focus-excerpt">{activePassage.excerpt || activePassage.text.slice(0, 140)}</p>
                <div className="starfield-keywords">
                  {activePassage.keywords.slice(0, 4).map((keyword) => (
                    <small key={keyword}>{keyword}</small>
                  ))}
                  {activePassage.keywords.length > 4 && <small>+{activePassage.keywords.length - 4}</small>}
                </div>
                <a className="primary-action" href={`/posts/${activePassage.article.slug}#${activePassage.anchor}`}>
                  定位到原文
                  <ExternalLink size={16} />
                </a>
                <div className="related-stars-list">
                  {activeDeepPaths.length > 0 && (
                    <>
                      <h3>深层路径</h3>
                      {activeDeepPaths.map((path) => {
                        const currentIndex = path.passageIds.indexOf(activePassage.id);
                        const nextPassageId = path.passageIds[currentIndex + 1] ?? path.passageIds[0];
                        const nextPassage = passages.find((passage) => passage.id === nextPassageId) ?? null;
                        return (
                          <article className="starfield-deep-path-card" key={path.id}>
                            <span>{path.pathType} · 强度 {path.strength.toFixed(2)}</span>
                            <strong>{path.title}</strong>
                            <p>{path.inquiry.question || path.rationale}</p>
                            <div>
                              {path.passageIds.map((passageId, index) => {
                                const step = passages.find((passage) => passage.id === passageId);
                                return (
                                  <button
                                    aria-current={passageId === activePassage.id ? 'step' : undefined}
                                    key={`${path.id}-${passageId}`}
                                    type="button"
                                    onClick={() => focusPassage(passageId)}
                                  >
                                    <small>{index + 1}</small>
                                    <span>{step?.title ?? '未知星点'}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {nextPassage && nextPassage.id !== activePassage.id && (
                              <button className="primary-action" type="button" onClick={() => focusPassage(nextPassage.id)}>
                                沿路径下一步
                                <ChevronRight size={16} />
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </>
                  )}
                  <h3>相关关系</h3>
                  {related.length > 0 ? (
                    related.map(({ passage, relationship }) => (
                      <button key={`${relationship.id}-${passage.id}`} type="button" onClick={() => focusPassage(passage.id)}>
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

          {activePassage && (
            <div className="starfield-inspector">
              <span>当前聚焦</span>
              <strong>{activePassage.title}</strong>
              <small>{versionName || '已发布星图'}</small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const UNTITLED_SAME_TOPIC = '未标记主题';
const relationshipTypeLabels: Record<string, string> = {
  same_topic: '同一主题',
  prerequisite: '前置知识',
  further_reading: '延伸阅读',
  problem_solution: '问题与解法',
  comparison: '对比关系',
  shared_principle: '共同原则',
  same_problem_shape: '同构问题',
  method_transfer: '方法迁移',
  tradeoff_parallel: '取舍相似',
  case_generalization: '案例与一般化',
  implementation_echo: '实现呼应',
};

function getRelationshipTopics(relationship: ApiStarfieldRelationship) {
  const topics = relationship.evidenceKeywords
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  if (topics.length > 0) {
    return topics;
  }

  const rationaleTopics = relationship.rationale
    .match(/涉及(.+?)(，|。|,|\.|适合|可用于)/)?.[1]
    ?.split(/[、,，]/)
    .map((topic) => topic.trim())
    .filter(Boolean) ?? [];
  return rationaleTopics.length > 0 ? rationaleTopics : [UNTITLED_SAME_TOPIC];
}

function getDeepPathsForPassage(activePassageId: string, deepPaths: ApiStarfieldDeepPath[]) {
  if (!activePassageId) {
    return [];
  }
  return deepPaths
    .filter((path) => path.passageIds.includes(activePassageId))
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 4);
}

function RelationshipNetworkPanel({
  filter,
  onChange,
  relationships,
}: {
  filter: RelationshipNetworkFilter;
  onChange: (next: RelationshipNetworkFilter) => void;
  relationships: ApiStarfieldRelationship[];
}) {
  const relationshipTypes = useMemo(() => {
    const next = new Map<string, { label: string; count: number }>();
    relationships.forEach((relationship) => {
      const current = next.get(relationship.relationshipType);
      next.set(relationship.relationshipType, {
        label: relationship.relationshipLabel || relationshipTypeLabels[relationship.relationshipType] || relationship.relationshipType,
        count: (current?.count ?? 0) + 1,
      });
    });
    return Array.from(next.entries()).sort((left, right) => right[1].count - left[1].count || left[1].label.localeCompare(right[1].label, 'zh-Hans-CN'));
  }, [relationships]);
  const topics = useMemo(() => {
    const next = new Map<string, number>();
    relationships.forEach((relationship) => {
      if (relationship.relationshipType !== 'same_topic') {
        return;
      }
      const evidenceTopics = getRelationshipTopics(relationship);
      evidenceTopics.forEach((topic) => {
        next.set(topic, (next.get(topic) ?? 0) + 1);
      });
    });
    return Array.from(next.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN'))
      .slice(0, 30);
  }, [relationships]);
  const selectedTopics = new Set(filter.topics);
  const selectedRelationshipTypes = new Set(filter.relationshipTypes);

  const toggleTopic = (topic: string) => {
    const nextTopics = selectedTopics.has(topic)
      ? filter.topics.filter((item) => item !== topic)
      : [...filter.topics, topic];
    onChange({ ...filter, showAllSameTopic: false, topics: nextTopics });
  };

  const toggleRelationshipType = (relationshipType: string) => {
    const nextTypes = selectedRelationshipTypes.has(relationshipType)
      ? filter.relationshipTypes.filter((item) => item !== relationshipType)
      : [...filter.relationshipTypes, relationshipType];
    onChange({ ...filter, relationshipTypes: nextTypes });
  };

  return (
    <aside className="starfield-network-panel" aria-label="关系网控制">
      <div className="starfield-network-head">
        <div>
          <Network size={16} />
          <span>关系分类</span>
        </div>
        <button
          aria-pressed={filter.relationshipTypes.length === 0 && filter.topics.length === 0 && !filter.showAllSameTopic}
          type="button"
          onClick={() => onChange({ showAllSameTopic: false, topics: [], relationshipTypes: [] })}
        >
          清除
        </button>
      </div>
      <p className="starfield-network-copy">点击关系类型或主题标签激活对应星线。</p>
      <div className="starfield-network-types">
        {relationshipTypes.map(([relationshipType, item]) => (
          <button
            aria-pressed={selectedRelationshipTypes.has(relationshipType)}
            key={relationshipType}
            type="button"
            onClick={() => toggleRelationshipType(relationshipType)}
          >
            <span>{item.label}</span>
            <small>{item.count}</small>
          </button>
        ))}
      </div>
      {topics.length > 0 && <p className="starfield-network-copy">同一主题标签</p>}
      <div className="starfield-network-types">
        {topics.map(([topic, count]) => (
          <button
            aria-pressed={selectedTopics.has(topic)}
            key={topic}
            type="button"
            onClick={() => toggleTopic(topic)}
          >
            <span>{topic}</span>
            <small>{count}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function GalaxyViewport({
  activePassageId,
  data,
  focusRequest,
  onPickPassage,
  relationshipNetwork,
}: {
  activePassageId: string;
  data: GalaxySceneData;
  focusRequest: FocusRequest | null;
  onPickPassage: (id: string) => void;
  relationshipNetwork: RelationshipNetworkFilter;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const starGroupRef = useRef<THREE.Group | null>(null);
  const edgeGroupRef = useRef<THREE.Group | null>(null);
  const dustGroupRef = useRef<THREE.Group | null>(null);
  const galaxyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const domeMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const animationRef = useRef<number | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const pickablesRef = useRef<Array<{ id: string; mesh: THREE.Mesh; sprite: THREE.Sprite }>>([]);
  const targetFocusRef = useRef(new THREE.Vector3());
  const currentFocusRef = useRef(new THREE.Vector3());
  const cameraFlightRef = useRef<CameraFlight | null>(null);
  const cameraLockRef = useRef<{ targetId: string; offset: THREE.Vector3 } | null>(null);
  const focusPassageRef = useRef<(id: string, shouldLock?: boolean) => void>(() => undefined);
  const hoveredIdRef = useRef('');
  const activePassageIdRef = useRef(activePassageId);
  const lockedPassageIdRef = useRef('');
  const sceneDataRef = useRef(data);
  const relationshipNetworkRef = useRef(relationshipNetwork);
  const lastFocusRequestNonceRef = useRef(0);
  const tuningRef = useRef<GalaxyTuning>(DEFAULT_GALAXY_TUNING);
  const keysRef = useRef<Record<string, boolean>>({});
  const lookRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const cameraAnglesRef = useRef({ yaw: Math.PI, pitch: -0.92 });
  const movementSpeedMultiplierRef = useRef(1);
  const [lockedPassageId, setLockedPassageId] = useState('');

  const setCameraLockTarget = (id: string) => {
    lockedPassageIdRef.current = id;
    setLockedPassageId(id);
  };

  const unlockCameraLock = () => {
    cameraLockRef.current = null;
    cameraFlightRef.current = null;
    setCameraLockTarget('');
  };

  useEffect(() => {
    activePassageIdRef.current = activePassageId;
    if (!activePassageId) {
      unlockCameraLock();
    }
  }, [activePassageId]);

  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastFocusRequestNonceRef.current) {
      return;
    }
    lastFocusRequestNonceRef.current = focusRequest.nonce;
    focusPassageRef.current(focusRequest.id, true);
  }, [focusRequest]);

  useEffect(() => {
    sceneDataRef.current = data;
    if (lockedPassageIdRef.current && !data.nodesById.has(lockedPassageIdRef.current)) {
      unlockCameraLock();
    }
  }, [data]);

  useEffect(() => {
    relationshipNetworkRef.current = relationshipNetwork;
  }, [relationshipNetwork]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = GALAXY_BASELINE.exposure * tuningRef.current.exposure;
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02030a');
    scene.fog = new THREE.FogExp2('#02030a', 0.00055);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2200);
    camera.position.set(0, 330, 128);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight('#8ecbff', 0.24);
    scene.add(ambient);

    const keyLight = new THREE.PointLight('#7fd4ff', 0.32, 560, 1.9);
    keyLight.position.set(0, 72, 120);
    scene.add(keyLight);

    const warmLight = new THREE.PointLight('#ffd36e', 0.22, 480, 2);
    warmLight.position.set(-96, -20, -72);
    scene.add(warmLight);

    const starGroup = new THREE.Group();
    const edgeGroup = new THREE.Group();
    const dustGroup = new THREE.Group();
    scene.add(dustGroup);
    scene.add(starGroup);
    scene.add(edgeGroup);
    starGroupRef.current = starGroup;
    edgeGroupRef.current = edgeGroup;
    dustGroupRef.current = dustGroup;

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const handleMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      if (lookRef.current.active) {
        const dx = event.clientX - lookRef.current.lastX;
        const dy = event.clientY - lookRef.current.lastY;
        lookRef.current.lastX = event.clientX;
        lookRef.current.lastY = event.clientY;
        cameraAnglesRef.current.yaw -= dx * 0.003;
        cameraAnglesRef.current.pitch -= dy * 0.003;
        const pitchLimit = Math.PI / 2 - 0.08;
        cameraAnglesRef.current.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, cameraAnglesRef.current.pitch));
        return;
      }

      const hoverTarget = pickPassage(pointerRef.current, camera, raycasterRef.current, pickablesRef.current);
      host.dataset.hovering = hoverTarget?.id ? 'true' : 'false';
      if (hoverTarget?.id && hoveredIdRef.current !== hoverTarget.id) {
        hoveredIdRef.current = hoverTarget.id;
      }
    };

    const handleLeave = () => {
      host.dataset.hovering = 'false';
      hoveredIdRef.current = '';
      lookRef.current.active = false;
    };

    const handleClick = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const picked = pickPassage(pointerRef.current, camera, raycasterRef.current, pickablesRef.current);
      if (picked?.id) {
        onPickPassage(picked.id);
      }
    };

    const getPassageWorldPosition = (id: string) => {
      const node = sceneDataRef.current.nodesById.get(id);
      if (!node || !starGroupRef.current) {
        return null;
      }
      starGroupRef.current.updateMatrixWorld();
      return node.position.clone().applyMatrix4(starGroupRef.current.matrixWorld);
    };

    const syncCameraAnglesToward = (lookAt: THREE.Vector3) => {
      const direction = lookAt.clone().sub(camera.position).normalize();
      cameraAnglesRef.current.yaw = Math.atan2(direction.x, direction.z);
      cameraAnglesRef.current.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    };

    const startCameraFlightToPassage = (id: string, shouldLock = true) => {
      const lookAt = getPassageWorldPosition(id);
      if (!lookAt || !cameraRef.current) {
        return;
      }
      const currentCamera = cameraRef.current;
      const currentViewDirection = currentCamera.position.clone().sub(lookAt).normalize();
      if (currentViewDirection.lengthSq() === 0) {
        currentViewDirection.set(0, 0.42, 1).normalize();
      }
      const targetOffset = currentViewDirection.multiplyScalar(46).add(new THREE.Vector3(0, 12, 0));
      const toPosition = lookAt.clone().add(targetOffset);
      cameraLockRef.current = shouldLock ? { targetId: id, offset: targetOffset.clone() } : null;
      setCameraLockTarget(shouldLock ? id : '');
      cameraFlightRef.current = {
        active: true,
        startedAt: performance.now(),
        duration: 980,
        fromPosition: currentCamera.position.clone(),
        toPosition,
        lookAt,
        targetId: id,
        targetOffset,
      };
    };

    focusPassageRef.current = (id: string, shouldLock = true) => {
      onPickPassage(id);
      startCameraFlightToPassage(id, shouldLock);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const picked = pickPassage(pointerRef.current, camera, raycasterRef.current, pickablesRef.current);
      if (picked?.id) {
        focusPassageRef.current(picked.id, true);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        cameraFlightRef.current = null;
        lookRef.current = { active: true, lastX: event.clientX, lastY: event.clientY };
        try {
          host.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic pointer events in tests may not have an active pointer capture target.
        }
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 2) {
        lookRef.current.active = false;
        try {
          host.releasePointerCapture?.(event.pointerId);
        } catch {
          // See setPointerCapture guard above.
        }
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const speedStep = event.deltaY < 0 ? 1.14 : 1 / 1.14;
      movementSpeedMultiplierRef.current = THREE.MathUtils.clamp(
        movementSpeedMultiplierRef.current * speedStep,
        0.25,
        8,
      );
    };

    const isTyping = () => {
      const active = document.activeElement;
      return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || Boolean(active?.closest('[contenteditable="true"]'));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping()) {
        return;
      }
      keysRef.current[event.code] = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
    };

    host.addEventListener('pointermove', handleMove);
    host.addEventListener('pointerleave', handleLeave);
    host.addEventListener('pointerdown', handlePointerDown);
    host.addEventListener('pointerup', handlePointerUp);
    host.addEventListener('pointerdown', handleClick);
    host.addEventListener('dblclick', handleDoubleClick);
    host.addEventListener('contextmenu', handleContextMenu);
    host.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let disposed = false;
    let galaxyRotation = -0.18;
    let lastFrame = performance.now();
    const animate = () => {
      if (disposed) {
        return;
      }

      const now = performance.now();
      const delta = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const time = now * 0.00015;
      const focusId = activePassageIdRef.current || hoveredIdRef.current;
      const focusNode = focusId ? sceneDataRef.current.nodesById.get(focusId) ?? null : null;
      const focusPosition = focusNode ? focusNode.position : sceneDataRef.current.centroid;
      targetFocusRef.current.lerp(focusPosition, 0.04);
      currentFocusRef.current.lerp(targetFocusRef.current, 0.06);

      const yaw = cameraAnglesRef.current.yaw;
      const pitch = cameraAnglesRef.current.pitch;
      const forward = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      ).normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const move = new THREE.Vector3();
      const keys = keysRef.current;
      if (keys.KeyW) {
        move.add(forward);
      }
      if (keys.KeyS) {
        move.sub(forward);
      }
      if (keys.KeyD) {
        move.add(right);
      }
      if (keys.KeyA) {
        move.sub(right);
      }
      if (keys.Space) {
        move.y += 1;
      }
      if (keys.ShiftLeft || keys.ShiftRight) {
        move.y -= 1;
      }
      const activeLock = cameraLockRef.current;
      const lockedLookAt = activeLock ? getPassageWorldPosition(activeLock.targetId) : null;
      if (activeLock && !lockedLookAt) {
        unlockCameraLock();
      }
      if (move.lengthSq() > 0) {
        cameraFlightRef.current = null;
        const speed = (keys.ControlLeft || keys.ControlRight ? 62 : 36) * movementSpeedMultiplierRef.current * delta;
        camera.position.add(move.normalize().multiplyScalar(speed));
        if (activeLock && lockedLookAt) {
          activeLock.offset.copy(camera.position).sub(lockedLookAt);
          camera.lookAt(lockedLookAt);
          syncCameraAnglesToward(lockedLookAt);
        } else {
          camera.lookAt(camera.position.clone().add(forward));
        }
      } else if (cameraFlightRef.current?.active) {
        const flight = cameraFlightRef.current;
        const progress = Math.min(1, (now - flight.startedAt) / flight.duration);
        const eased = easeInOutCubic(progress);
        const liveLookAt = flight.targetId ? getPassageWorldPosition(flight.targetId) ?? flight.lookAt : flight.lookAt;
        const liveToPosition = flight.targetOffset ? liveLookAt.clone().add(flight.targetOffset) : flight.toPosition;
        camera.position.copy(flight.fromPosition).lerp(liveToPosition, eased);
        camera.lookAt(liveLookAt);
        syncCameraAnglesToward(liveLookAt);
        if (progress >= 1) {
          if (flight.targetId && flight.targetOffset && cameraLockRef.current?.targetId === flight.targetId) {
            cameraLockRef.current.offset.copy(camera.position).sub(liveLookAt);
          }
          cameraFlightRef.current = null;
        }
      } else if (activeLock && lockedLookAt) {
        const lockedDistance = THREE.MathUtils.clamp(activeLock.offset.length(), 18, 180);
        if (lookRef.current.active) {
          activeLock.offset.copy(forward).multiplyScalar(-lockedDistance);
        }
        camera.position.lerp(lockedLookAt.clone().add(activeLock.offset), 0.18);
        camera.lookAt(lockedLookAt);
        syncCameraAnglesToward(lockedLookAt);
      } else {
        camera.lookAt(camera.position.clone().add(forward));
      }

      galaxyRotation = (galaxyRotation + 0.00022) % (Math.PI * 2);
      starGroup.rotation.y = galaxyRotation;
      starGroup.rotation.x = -0.04 + Math.sin(time * 0.5) * 0.018;
      edgeGroup.rotation.copy(starGroup.rotation);
      dustGroup.rotation.copy(starGroup.rotation);
      applyGalaxyTuning(renderer, galaxyMaterialRef.current, domeMaterialRef.current, tuningRef.current);

      data.nodes.forEach((node) => {
        if (!node.sprite) {
          return;
        }
        const selected = node.passage.id === activePassageIdRef.current;
        const hovered = node.passage.id === hoveredIdRef.current;
        const distanceToFocus = node.position.distanceTo(currentFocusRef.current);
        const pulse = 1 + Math.sin(time * 80 + Number(node.sprite.userData.seed ?? 0) * Math.PI * 2) * 0.08;
        const liveTuning = tuningRef.current;
        const passageScale = (selected ? 1.55 : hovered ? 1.25 : GALAXY_BASELINE.passageSize) * liveTuning.passageSize;
        const particleScale = node.radius * passageScale * pulse * (1 + Math.max(0, 1.4 - distanceToFocus / 120) * 0.03);
        node.sprite.scale.setScalar(particleScale);
        node.pickMesh?.scale.setScalar(3.8);
        if (node.sprite.material instanceof THREE.SpriteMaterial) {
          const passageOpacity = perceptualBrightnessMultiplier(liveTuning.passageBrightness);
          const baseOpacity = selected ? 0.95 : hovered ? 0.72 : GALAXY_BASELINE.passageBrightness;
          node.sprite.material.opacity = Math.min(1, baseOpacity * passageOpacity);
        }
      });

      edgeGroup.children.forEach((child: THREE.Object3D) => {
        const line = child as THREE.Line;
        const payload = line.userData as { relationship: ApiStarfieldRelationship; sourceId: string; targetId: string };
        const relationFocusId = activePassageIdRef.current || hoveredIdRef.current;
        const networkFilter = relationshipNetworkRef.current;
        const relationshipTopics = getRelationshipTopics(payload.relationship);
        const selectedByTopic = networkFilter.topics.some((topic) => relationshipTopics.includes(topic));
        const selectedByType = networkFilter.relationshipTypes.includes(payload.relationship.relationshipType);
        const selectedByNetwork = selectedByType || (payload.relationship.relationshipType === 'same_topic' && (networkFilter.showAllSameTopic || selectedByTopic));
        const selectedByFocus = relationFocusId && (payload.sourceId === relationFocusId || payload.targetId === relationFocusId);
        const selected = selectedByNetwork || selectedByFocus;
        const relationMaterial = line.material as THREE.ShaderMaterial;
        line.visible = Boolean(selected);
        relationMaterial.uniforms.uTime.value = now * 0.001;
        relationMaterial.uniforms.uOpacity.value = selectedByNetwork ? 0.34 : selectedByFocus ? 0.82 : 0;
      });

      renderer.render(scene, camera);
      animationRef.current = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      disposed = true;
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      host.removeEventListener('pointermove', handleMove);
      host.removeEventListener('pointerleave', handleLeave);
      host.removeEventListener('pointerdown', handlePointerDown);
      host.removeEventListener('pointerup', handlePointerUp);
      host.removeEventListener('pointerdown', handleClick);
      host.removeEventListener('dblclick', handleDoubleClick);
      host.removeEventListener('contextmenu', handleContextMenu);
      host.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      observer.disconnect();
      host.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object: THREE.Object3D) => {
        if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
          object.geometry.dispose();
        }
        if ('material' in object && object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: THREE.Material) => material.dispose());
        }
      });
    };
  }, [onPickPassage]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !starGroupRef.current || !edgeGroupRef.current || !dustGroupRef.current) {
      return;
    }

    const starGroup = starGroupRef.current;
    const edgeGroup = edgeGroupRef.current;
    const dustGroup = dustGroupRef.current;

    starGroup.clear();
    edgeGroup.clear();
    dustGroup.clear();
    pickablesRef.current = [];

    const backdrop = createShiyunGalaxyBackdrop('high', tuningRef.current);
    galaxyMaterialRef.current = null;
    domeMaterialRef.current = null;
    backdrop.traverse((object) => {
      if (object instanceof THREE.Points && object.material instanceof THREE.ShaderMaterial && object.userData.kind === 'galaxyBackdrop') {
        galaxyMaterialRef.current = object.material;
      }
      if (object instanceof THREE.Points && object.material instanceof THREE.PointsMaterial && object.userData.kind === 'starDome') {
        domeMaterialRef.current = object.material;
      }
    });
    dustGroup.add(backdrop);
    applyGalaxyTuning(rendererRef.current, galaxyMaterialRef.current, domeMaterialRef.current, tuningRef.current);

    data.nodes.forEach((node) => {
      const particle = createPassageParticle(node, data.nodes.indexOf(node));
      particle.group.position.copy(node.position);
      node.sprite = particle.sprite;
      node.pickMesh = particle.pickMesh;
      starGroup.add(particle.group);
      pickablesRef.current.push({ id: node.passage.id, mesh: particle.pickMesh, sprite: particle.sprite });
    });

    data.edges.forEach((edge) => {
      const geometry = createRelationshipCurveGeometry(edge);
      const material = createRelationshipPulseMaterial(edge.source.color.clone().lerp(edge.target.color, 0.5));
      const line = new THREE.Line(geometry, material);
      line.userData = {
        relationship: edge.relationship,
        sourceId: edge.source.passage.id,
        targetId: edge.target.passage.id,
      };
      edgeGroup.add(line);
    });

    return () => {
      data.nodes.forEach((node) => {
        node.sprite = undefined;
        node.pickMesh = undefined;
      });
      starGroup.clear();
      edgeGroup.clear();
      dustGroup.clear();
      galaxyMaterialRef.current = null;
      domeMaterialRef.current = null;
      pickablesRef.current = [];
    };
  }, [data]);

  return (
    <div className="starfield-map" aria-label={data.label}>
      <div ref={hostRef} className="starfield-canvas" />
      <div className="starfield-overlay">
        <div className="starfield-legend">
          <span>3D Galaxy</span>
          <small>{data.nodes.length} 个星点 · {data.edges.length} 条关系</small>
        </div>
        <div className="starfield-hint">WASD 移动 · 滚轮调速 · 按住右键转动视角 · 双击星点锁定跟踪</div>
        {(activePassageId || lockedPassageId) && (
          <div className="starfield-camera-controls" aria-label="摄像机控制">
            <button disabled={!lockedPassageId} type="button" onClick={unlockCameraLock}>
              <Unlock size={14} />
              {lockedPassageId ? '解锁视角锁定' : '未锁定'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function createGalaxyScene(
  passages: ApiStarfieldPassage[],
  relationships: ApiStarfieldRelationship[],
  _colorMap: Record<string, string>,
) {
  const articleGroups = new Map<string, ApiStarfieldPassage[]>();
  passages.forEach((passage) => {
    const articleId = passage.article.id || passage.articleId || 'unknown';
    const group = articleGroups.get(articleId) ?? [];
    group.push(passage);
    articleGroups.set(articleId, group);
  });
  const articleIds = Array.from(articleGroups.keys());
  const articleCenters = new Map(
    articleIds.map((articleId, articleIndex) => [
      articleId,
      getGalaxyPosition(articleIndex, articleIds.length, 1.2 + Math.min(1.2, (articleGroups.get(articleId)?.length ?? 1) / 8)),
    ] as const),
  );
  const passageClusterIndex = new Map<string, { index: number; total: number }>();
  articleGroups.forEach((group) => {
    group.forEach((passage, index) => {
      passageClusterIndex.set(passage.id, { index, total: group.length });
    });
  });

  const nodes: StarNode[] = passages.map((passage, index) => {
    const articleId = passage.article.id || passage.articleId || 'unknown';
    const articleCenter = articleCenters.get(articleId) ?? getGalaxyPosition(index, passages.length, passage.starSize ?? 1);
    const cluster = passageClusterIndex.get(passage.id) ?? { index: 0, total: 1 };
    const color = getGalaxyParticleColor(stableStringSeed(articleId) + 9100);
    const position = getArticleClusteredPosition(articleCenter, cluster.index, cluster.total, index, passage.starSize ?? 1);
    return {
      passage,
      position,
      color,
      radius: 0.9 + (passage.starSize ?? 1) * 0.75,
    };
  });

  const nodesById = new Map(nodes.map((node) => [node.passage.id, node] as const));
  const uniqueRelationships = dedupeRelationships(relationships).sort(
    (left, right) => Number(right.isCrossArticle) - Number(left.isCrossArticle) || right.strength - left.strength,
  );
  const edges = uniqueRelationships
    .map((relationship) => {
      const source = nodesById.get(relationship.sourcePassageId);
      const target = nodesById.get(relationship.targetPassageId);
      if (!source || !target || source.passage.id === target.passage.id) {
        return null;
      }
      return { relationship, source, target } satisfies StarEdge;
    })
    .filter((item): item is StarEdge => item !== null);

  const centroid = nodes.length > 0
    ? nodes.reduce((accumulator, node) => accumulator.add(node.position), new THREE.Vector3()).multiplyScalar(1 / nodes.length)
    : new THREE.Vector3();

  return {
    label: '三维银河星图',
    nodes,
    nodesById,
    edges,
    centroid,
  } satisfies GalaxySceneData;
}

function getArticleClusteredPosition(
  articleCenter: THREE.Vector3,
  passageIndex: number,
  passageTotal: number,
  seed: number,
  starSize: number,
) {
  if (passageTotal <= 1) {
    return articleCenter.clone();
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const ringProgress = (passageIndex + 0.5) / passageTotal;
  const clusterRadius = Math.min(18, 4.8 + Math.sqrt(passageTotal) * 2.15);
  const angle = passageIndex * goldenAngle + seededRandom(seed + 1200) * 0.55;
  const radius = Math.sqrt(ringProgress) * clusterRadius + (seededRandom(seed + 1300) - 0.5) * 2.2 + starSize * 0.35;
  const verticalOffset = gauss3(seededRandom(seed + 1400), seededRandom(seed + 1401), seededRandom(seed + 1402)) * Math.min(4.8, clusterRadius * 0.28);

  return articleCenter.clone().add(new THREE.Vector3(
    Math.cos(angle) * radius,
    verticalOffset,
    Math.sin(angle) * radius,
  ));
}

function getGalaxyPosition(index: number, total: number, starSize: number) {
  const normalized = total > 1 ? index / (total - 1) : 0;
  const armIndex = index % SHIYUN_GALAXY.BRANCHES;
  const armOffset = (armIndex / SHIYUN_GALAXY.BRANCHES) * Math.PI * 2;
  const radialJitter = (seededRandom(index + 71) - 0.5) * 14;
  const radius = 24 + Math.pow(normalized, 0.82) * (SHIYUN_GALAXY.RADIUS * 0.72) + starSize * 1.8 + radialJitter;
  const t = radius / SHIYUN_GALAXY.RADIUS;
  const armDeviation = gauss3(seededRandom(index + 33), seededRandom(index + 34), seededRandom(index + 35)) * SHIYUN_GALAXY.ARM_SPREAD * 0.36;
  const coreBlend = Math.max(0, 0.35 - t) / 0.35;
  const spin = armOffset + t * SHIYUN_GALAXY.TWIST + armDeviation + (seededRandom(index + 36) - 0.5) * coreBlend * Math.PI;
  const scatter = Math.pow(seededRandom(index + 81), 2.4) * (seededRandom(index + 82) < 0.5 ? -1 : 1) * radius * 0.08;
  const height = gauss3(seededRandom(index + 1), seededRandom(index + 2), seededRandom(index + 3)) * radius * SHIYUN_GALAXY.THICKNESS * 0.72;
  const warp = Math.sin(t * Math.PI * 3 + armOffset) * 3.6;

  return new THREE.Vector3(
    Math.cos(spin) * radius + Math.cos(spin + Math.PI / 2) * scatter,
    height + warp * 0.35,
    Math.sin(spin) * radius + Math.sin(spin + Math.PI / 2) * scatter,
  );
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function stableStringSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function dedupeRelationships(relationships: ApiStarfieldRelationship[]) {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    const key = [relationship.sourcePassageId, relationship.targetPassageId].sort().join('::');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function perceptualBrightnessMultiplier(value: number) {
  return value <= 1 ? value : 1 + (value - 1) * 3;
}

function applyGalaxyTuning(
  renderer: THREE.WebGLRenderer | null,
  galaxyMaterial: THREE.ShaderMaterial | null,
  domeMaterial: THREE.PointsMaterial | null,
  tuning: GalaxyTuning,
) {
  const exposure = perceptualBrightnessMultiplier(tuning.exposure);
  const particleBrightness = perceptualBrightnessMultiplier(tuning.particleBrightness);
  const domeBrightness = perceptualBrightnessMultiplier(tuning.domeBrightness);

  if (renderer) {
    renderer.toneMappingExposure = GALAXY_BASELINE.exposure * exposure;
  }
  if (galaxyMaterial) {
    galaxyMaterial.uniforms.uSize.value = GALAXY_BASELINE.particleSize * tuning.particleSize;
    galaxyMaterial.uniforms.uBrightness.value = GALAXY_BASELINE.particleBrightness * particleBrightness;
    galaxyMaterial.uniforms.uSharpness.value = GALAXY_BASELINE.particleSharpness * tuning.particleSharpness;
  }
  if (domeMaterial) {
    domeMaterial.size = GALAXY_BASELINE.domeSize * tuning.domeSize;
    domeMaterial.opacity = GALAXY_BASELINE.domeBrightness * domeBrightness;
    domeMaterial.needsUpdate = true;
  }
}

function createRelationshipCurveGeometry(edge: StarEdge) {
  const start = edge.source.position.clone();
  const end = edge.target.position.clone();
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const distance = start.distanceTo(end);
  const seed = stableStringSeed(`${edge.relationship.id}:${edge.source.passage.id}:${edge.target.passage.id}`);
  const direction = end.clone().sub(start).normalize();
  const radialDirection = new THREE.Vector3(midpoint.x, 0, midpoint.z);
  if (radialDirection.lengthSq() < 0.001) {
    radialDirection.set(-direction.z, 0, direction.x);
  }
  radialDirection.normalize();

  const sideDirection = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
  if (sideDirection.lengthSq() < 0.001) {
    sideDirection.set(1, 0, 0);
  }
  sideDirection.normalize();

  const outwardBend = THREE.MathUtils.clamp(distance * 0.18, 8, 34);
  const verticalLift = THREE.MathUtils.clamp(distance * (0.07 + seededRandom(seed + 13) * 0.06), 5, 24);
  const sideBend = (seededRandom(seed + 29) - 0.5) * THREE.MathUtils.clamp(distance * 0.18, 5, 24);
  const bendSign = seededRandom(seed + 41) < 0.28 ? -1 : 1;
  const control = midpoint
    .clone()
    .add(radialDirection.multiplyScalar(outwardBend * bendSign))
    .add(sideDirection.multiplyScalar(sideBend))
    .add(new THREE.Vector3(0, verticalLift, 0));

  const segments = THREE.MathUtils.clamp(Math.ceil(distance / 6), 18, 46);
  const points = new THREE.QuadraticBezierCurve3(start, control, end).getPoints(segments);
  const lineDistances = new Float32Array(points.length);
  let accumulatedDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    accumulatedDistance += points[index - 1].distanceTo(points[index]);
    lineDistances[index] = accumulatedDistance;
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
  return geometry;
}

function createRelationshipPulseMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float lineDistance;
      varying float vLineDistance;
      void main() {
        vLineDistance = lineDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vLineDistance;
      void main() {
        float wave = 0.5 + 0.5 * sin(vLineDistance * 0.18 - uTime * 5.8);
        float pulse = pow(wave, 2.4);
        float alpha = uOpacity * (0.42 + pulse * 0.72);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uColor * (1.55 + pulse * 2.1), alpha);
      }
    `,
  });
}

function createBackgroundStars() {
  const particleCount = 320;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const radius = 260 + seededRandom(index + 2400) * 520;
    const theta = seededRandom(index + 2500) * Math.PI * 2;
    const phi = Math.acos(2 * seededRandom(index + 2600) - 1);
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[index * 3 + 1] = Math.cos(phi) * radius * 0.45;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    const color = new THREE.Color('#7894ff').lerp(new THREE.Color('#ffffff'), seededRandom(index + 2700) * 0.75);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.42,
    map: createGlowTexture('#ffffff'),
    vertexColors: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function createPassageParticle(node: StarNode, index: number) {
  const group = new THREE.Group();
  const particleColor = node.color.clone().offsetHSL(0, 0.18, -0.12);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: particleColor,
      map: softGlowTexture(),
      toneMapped: false,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.userData = { id: node.passage.id, seed: seededRandom(index + 5100) };
  sprite.scale.setScalar(node.radius * 0.74);
  group.add(sprite);

  const pickGeometry = new THREE.SphereGeometry(3.8, 12, 8);
  const pickMesh = new THREE.Mesh(
    pickGeometry,
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  pickMesh.userData = { id: node.passage.id };
  group.add(pickMesh);

  return { group, sprite, pickMesh };
}

function getGalaxyParticleColor(seed: number) {
  const cArm = new THREE.Color('#3192ff');
  const cGold = new THREE.Color('#ffd12e');
  const cViolet = new THREE.Color('#a83dff');
  const cRed = new THREE.Color('#ff3d3d');
  const cCyan = new THREE.Color('#23c7ff');
  const cHII = new THREE.Color('#ff2f6f');
  const palettePick = seededRandom(seed);
  const armProximity = seededRandom(seed + 1);
  const color = (palettePick < 0.3 ? cArm : palettePick < 0.56 ? cGold : palettePick < 0.78 ? cViolet : cRed).clone();
  color.lerp(cCyan, armProximity * 0.18);
  if (seededRandom(seed + 2) < 0.32 + armProximity * 0.24) {
    const accentPick = seededRandom(seed + 3);
    const accentColor = accentPick < 0.34 ? cGold : accentPick < 0.62 ? cViolet : accentPick < 0.82 ? cRed : cCyan;
    color.lerp(accentColor, 0.45);
  }
  if (armProximity > 0.5 && seededRandom(seed + 4) < 0.095) {
    color.copy(cHII);
  }
  return color;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss3(a: number, b: number, c: number) {
  return a + b + c - 1.5;
}

function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const hash = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const n00 = hash(xi, zi);
  const n10 = hash(xi + 1, zi);
  const n01 = hash(xi, zi + 1);
  const n11 = hash(xi + 1, zi + 1);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

// Galaxy particle recipe adapted from Cohenjikan/shiyun (MIT license), rewritten for this imperative Three.js scene.
function createShiyunGalaxyBackdrop(quality: 'high' | 'low' = 'high', tuning: GalaxyTuning = DEFAULT_GALAXY_TUNING) {
  const hi = quality === 'high';
  const dustCount = hi ? 18000 : 9000;
  const starCount = hi ? 1400 : 700;
  const bulgeCount = hi ? 4200 : 2400;
  const total = dustCount + starCount + bulgeCount;
  const rnd = mulberry32(31337);
  const radiusMax = SHIYUN_GALAXY.RADIUS;
  const noiseFrequency = 4.2 / radiusMax;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const scales = new Float32Array(total);
  const coreFactors = new Float32Array(total);
  const color = new THREE.Color();
  const cCore = new THREE.Color('#fff1d6');
  const cInner = new THREE.Color('#fff7ec');
  const cMid = new THREE.Color('#b9d8ff');
  const cArm = new THREE.Color('#3192ff');
  const cHII = new THREE.Color('#ff2f6f');
  const cGold = new THREE.Color('#ffd12e');
  const cCyan = new THREE.Color('#23c7ff');
  const cRed = new THREE.Color('#ff3d3d');
  const cViolet = new THREE.Color('#a83dff');
  const expRadius = (height: number, cap: number) => Math.min(cap, -height * Math.log(1 - rnd() * 0.9999));

  for (let index = 0; index < total; index += 1) {
    const isBulge = index >= dustCount + starCount;
    const isStar = !isBulge && index >= dustCount;
    let x = 0;
    let y = 0;
    let z = 0;
    let t = 0;
    let armProximity = 0;
    let brightness = 0;
    let hii = false;

    if (isBulge) {
      const rr = expRadius(radiusMax * 0.1, radiusMax * 0.42);
      t = rr / radiusMax;
      const phi = rnd() * Math.PI * 2;
      const cosTheta = 2 * rnd() - 1;
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      x = rr * sinTheta * Math.cos(phi) + radiusMax * 0.05 * (rnd() - 0.5);
      z = rr * sinTheta * Math.sin(phi) + radiusMax * 0.05 * (rnd() - 0.5);
      y = rr * cosTheta * 0.6 + radiusMax * 0.03 * (rnd() - 0.5);
      armProximity = 0.2;
      const noise = valueNoise(x * noiseFrequency * 1.6, z * noiseFrequency * 1.6);
      brightness = (0.16 - t * 0.078) * (0.34 + rnd() * 0.36) * (0.62 + noise * 0.48);
    } else {
      const rr = expRadius(radiusMax * 0.27, radiusMax) + radiusMax * 0.015;
      t = rr / radiusMax;
      const branch = (Math.floor(rnd() * SHIYUN_GALAXY.BRANCHES) / SHIYUN_GALAXY.BRANCHES) * Math.PI * 2;
      const twist = t * SHIYUN_GALAXY.TWIST;
      const armDeviation = gauss3(rnd(), rnd(), rnd()) * SHIYUN_GALAXY.ARM_SPREAD;
      armProximity = Math.exp(-((armDeviation / SHIYUN_GALAXY.ARM_SPREAD) ** 2) * 2.2);
      const coreBlend = Math.max(0, 0.45 - t) / 0.45;
      const angle = branch + twist + armDeviation + (rnd() - 0.5) * Math.PI * 2 * coreBlend * coreBlend;
      const scatter = (amount: number) => Math.pow(rnd(), 2.6) * (rnd() < 0.5 ? -1 : 1) * amount * rr;
      const coreFill = coreBlend * coreBlend * radiusMax * 0.07;
      x = Math.cos(angle) * rr + scatter(0.16) + (rnd() - 0.5) * 2 * coreFill;
      z = Math.sin(angle) * rr + scatter(0.16) + (rnd() - 0.5) * 2 * coreFill;
      y = gauss3(rnd(), rnd(), rnd()) * rr * SHIYUN_GALAXY.THICKNESS * (isStar ? 0.8 : 1.1);
      const noise = valueNoise(x * noiseFrequency, z * noiseFrequency);
      const armBoost = isStar ? 0.38 + armProximity * 1.02 : 0.3 + armProximity * 0.82;
      brightness = (armBoost + coreBlend * 0.07) * (0.36 + coreBlend * 0.08 + noise * 0.66) * (0.68 + rnd() * 0.38);
      hii = isStar && armProximity > 0.5 && rnd() < 0.095;
    }

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    coreFactors[index] = Math.max(0, 1 - t / 0.34);

    if (t < 0.12) {
      color.copy(cCore).lerp(cInner, t / 0.12);
    } else if (t < 0.4) {
      color.copy(cInner).lerp(cMid, (t - 0.12) / 0.28);
    } else {
      color.copy(cMid).lerp(cArm, Math.min(1, (t - 0.4) / 0.5));
    }
    if (!isBulge) {
      const palettePick = rnd();
      const baseNebulaColor = palettePick < 0.3 ? cArm : palettePick < 0.56 ? cGold : palettePick < 0.78 ? cViolet : cRed;
      color.copy(baseNebulaColor).lerp(cCyan, armProximity * 0.18);
      if (rnd() < 0.32 + armProximity * 0.24) {
        const accentPick = rnd();
        const accentColor = accentPick < 0.34 ? cGold : accentPick < 0.62 ? cViolet : accentPick < 0.82 ? cRed : cCyan;
        color.lerp(accentColor, 0.45);
      }
    }
    if (hii) {
      color.copy(cHII);
    }
    const saturationLift = isBulge ? 1 : 1.06 + armProximity * 0.1;
    colors[index * 3] = color.r * brightness * saturationLift;
    colors[index * 3 + 1] = color.g * brightness * saturationLift;
    colors[index * 3 + 2] = color.b * brightness * saturationLift;

    scales[index] = isBulge
      ? (0.56 + Math.max(0, 0.24 - t) * 0.54) * (0.48 + rnd() * 0.44)
      : isStar
        ? (0.72 + armProximity * 1.0 + (hii ? 1.35 : 0)) * (0.66 + rnd() * 0.62)
        : (0.6 + (1 - t) * 0.66) * (0.62 + rnd() * 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aCore', new THREE.BufferAttribute(coreFactors, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uBrightness: { value: GALAXY_BASELINE.particleBrightness * tuning.particleBrightness },
      uSharpness: { value: GALAXY_BASELINE.particleSharpness * tuning.particleSharpness },
      uSize: { value: GALAXY_BASELINE.particleSize * tuning.particleSize },
    },
    vertexShader: `
      uniform float uSize;
      attribute vec3 aColor;
      attribute float aScale;
      attribute float aCore;
      varying vec3 vColor;
      varying float vCore;
      void main() {
        vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float coreSize = mix(1.0, 0.58, aCore);
        gl_PointSize = clamp(uSize * aScale * coreSize * (800.0 / -viewPosition.z), 0.34, 18.0);
        vColor = aColor;
        vCore = aCore;
      }
    `,
    fragmentShader: `
      uniform float uBrightness;
      uniform float uSharpness;
      varying vec3 vColor;
      varying float vCore;
      void main() {
        float distanceFromCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float alpha = exp(-distanceFromCenter * distanceFromCenter * uSharpness);
        if (alpha < 0.004) discard;
        float coreCompress = mix(1.0, 0.42, vCore);
        gl_FragColor = vec4(vColor * alpha * uBrightness * coreCompress, alpha * mix(0.94, 0.58, vCore));
      }
    `,
  });

  const group = new THREE.Group();
  const galaxy = new THREE.Points(geometry, material);
  galaxy.frustumCulled = false;
  galaxy.userData = { kind: 'galaxyBackdrop' };
  group.add(galaxy);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softGlowTexture(),
      color: new THREE.Color('#ffe9c4'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.14,
    }),
  );
  halo.scale.set(radiusMax * 0.82, radiusMax * 0.82, 1);
  group.add(halo);
  group.add(createShiyunStarDome(rnd, tuning));
  return group;
}

function createShiyunStarDome(rnd: () => number, tuning: GalaxyTuning = DEFAULT_GALAXY_TUNING) {
  const particleCount = 1400;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const radius = 2200;
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const glow = 0.5 + rnd() * 0.5;
    colors[index * 3] = glow;
    colors[index * 3 + 1] = glow;
    colors[index * 3 + 2] = glow * 1.05;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: GALAXY_BASELINE.domeSize * tuning.domeSize,
      sizeAttenuation: true,
      vertexColors: true,
      map: softGlowTexture(),
      transparent: true,
      opacity: GALAXY_BASELINE.domeBrightness * tuning.domeBrightness,
      depthWrite: false,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
    }),
  );
  dome.frustumCulled = false;
  dome.userData = { kind: 'starDome' };
  return dome;
}

function pickPassage(
  pointer: THREE.Vector2,
  camera: THREE.PerspectiveCamera,
  raycaster: THREE.Raycaster,
  pickables: Array<{ id: string; mesh: THREE.Mesh; sprite: THREE.Sprite }>,
) {
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3();
  const projectedEdge = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  let nearestItem: { id: string; mesh: THREE.Mesh; sprite: THREE.Sprite } | null = null;
  let nearestDistance = Infinity;

  pickables.forEach((item) => {
    item.sprite.updateMatrixWorld();
    item.sprite.getWorldPosition(worldPosition);
    projected.copy(worldPosition).project(camera);
    if (projected.z < -1 || projected.z > 1) {
      return;
    }

    const visibleRadius = Math.max(item.sprite.scale.x, item.sprite.scale.y, item.mesh.geometry.boundingSphere?.radius ?? 1) * 0.62;
    projectedEdge.copy(worldPosition).addScaledVector(cameraRight, visibleRadius).project(camera);
    const projectedRadius = Math.hypot(projectedEdge.x - projected.x, projectedEdge.y - projected.y);
    const hitRadius = THREE.MathUtils.clamp(projectedRadius * 1.9, 0.045, 0.18);
    const distance = Math.hypot(projected.x - pointer.x, projected.y - pointer.y);

    if (distance <= hitRadius && distance < nearestDistance) {
      nearestItem = item;
      nearestDistance = distance;
    }
  });
  if (nearestItem) {
    return nearestItem;
  }

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables.map((item) => item.mesh), false);
  if (hits.length === 0) {
    return null;
  }
  const hit = hits[0].object;
  return pickables.find((item) => item.mesh === hit) ?? null;
}

function createGlowTexture(color: string) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const baseColor = new THREE.Color(color);
  const r = Math.round(baseColor.r * 255);
  const g = Math.round(baseColor.g * 255);
  const b = Math.round(baseColor.b * 255);
  const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(0.24, `rgba(${r}, ${g}, ${b}, 0.62)`);
  gradient.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.18)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

let cachedSoftGlowTexture: THREE.Texture | null = null;

function softGlowTexture() {
  if (cachedSoftGlowTexture) {
    return cachedSoftGlowTexture;
  }
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.1, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  cachedSoftGlowTexture = new THREE.CanvasTexture(canvas);
  cachedSoftGlowTexture.colorSpace = THREE.SRGBColorSpace;
  cachedSoftGlowTexture.needsUpdate = true;
  return cachedSoftGlowTexture;
}

function getRelatedStars(activeId: string, passages: ApiStarfieldPassage[], relationships: ApiStarfieldRelationship[]) {
  if (!activeId) {
    return [];
  }
  return relationships
    .filter((relationship) => relationship.sourcePassageId === activeId || relationship.targetPassageId === activeId)
    .sort(
      (left, right) =>
        Number(right.relationshipType !== 'same_topic') - Number(left.relationshipType !== 'same_topic') ||
        Number(right.isCrossArticle) - Number(left.isCrossArticle) ||
        right.strength - left.strength,
    )
    .slice(0, 18)
    .map((relationship) => {
      const relatedId = relationship.sourcePassageId === activeId ? relationship.targetPassageId : relationship.sourcePassageId;
      const passage = passages.find((item) => item.id === relatedId);
      return passage ? { passage, relationship } : null;
    })
    .filter((item): item is { passage: ApiStarfieldPassage; relationship: ApiStarfieldRelationship } => item !== null);
}
