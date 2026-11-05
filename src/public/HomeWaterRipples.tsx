import { useEffect, useRef } from "react";

export function HomeWaterRipples() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const container = layer?.parentElement;
    if (!layer || !container) return;

    // 只在首页内容区可见时播放，隐藏标签页和减少动态效果时保留静态纹理。
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inViewport = false;
    const updatePlayback = () => {
      layer.dataset.running = String(
        inViewport && !document.hidden && !motionPreference.matches,
      );
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      updatePlayback();
    });
    observer.observe(container);
    document.addEventListener("visibilitychange", updatePlayback);
    motionPreference.addEventListener("change", updatePlayback);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePlayback);
      motionPreference.removeEventListener("change", updatePlayback);
    };
  }, []);

  return <div aria-hidden="true" className="home-water-ripples" ref={layerRef} />;
}
