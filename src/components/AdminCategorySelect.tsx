import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './admin-category-select.css';

type CategoryOption = { value: string; label: string; count?: number };
type MenuPosition = { left: number; top: number; width: number; maxHeight: number; transform?: string };

export function AdminCategorySelect({
  ariaLabel,
  compact = false,
  disabled = false,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  compact?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: CategoryOption[];
  value: string;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const unavailable = disabled || options.length === 0;
  const expanded = open && !unavailable;

  function openMenu(index = Math.max(0, selectedIndex)) {
    setActiveIndex(index);
    setPosition(null);
    setOpen(true);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!expanded) return;

    // 菜单挂到页面根节点，避开筛选栏的裁切，并根据视口空间自动向上展开。
    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const below = viewportBottom - rect.bottom - 20;
      const above = rect.top - viewportTop - 20;
      const desiredHeight = Math.min(350, 52 + options.length * 44);
      const upwards = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(350, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 240), viewportWidth - 24);
      setPosition({
        left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)),
        top: upwards ? rect.top - 8 : rect.bottom + 8,
        width,
        maxHeight,
        transform: upwards ? 'translateY(-100%)' : undefined,
      });
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    // 菜单内部滚动只移动选项；页面或容器滚动时才重新定位浮层。
    function handleScroll(event: Event) {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) updatePosition();
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [expanded, options.length]);

  useLayoutEffect(() => {
    if (!expanded || !position) return;
    const list = listRef.current;
    const option = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !option) return;
    // 只滚动菜单本身，避免键盘选择分类时带动整个后台页面。
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, expanded, position]);

  useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);

  useEffect(() => {
    if (!expanded) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [expanded]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing || unavailable) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const edge = event.key === 'Home' ? 0 : options.length - 1;
      if (event.key === 'Home' || event.key === 'End') {
        if (expanded) setActiveIndex(edge);
        else openMenu(edge);
      } else if (!expanded) {
        openMenu();
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + direction + options.length) % options.length);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (expanded) chooseOption(activeIndex);
      else openMenu();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const previous = typeaheadRef.current;
      const query = (now - previous.time < 600 ? previous.text : '') + event.key.toLocaleLowerCase();
      typeaheadRef.current = { text: query, time: now };
      const start = expanded ? activeIndex + 1 : Math.max(0, selectedIndex);
      const index = options.findIndex((_, offset) => options[(start + offset) % options.length].label.toLocaleLowerCase().startsWith(query));
      if (index >= 0) {
        event.preventDefault();
        const match = (start + index) % options.length;
        if (expanded) setActiveIndex(match);
        else openMenu(match);
      }
    }
  }

  return (
    <>
      {/* 焦点保留在组合框上，Tab 可自然进入下一个控件；读屏通过活动选项获知位置。 */}
      <button
        aria-activedescendant={expanded ? `${menuId}-${activeIndex}` : undefined}
        aria-controls={expanded ? menuId : undefined}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`admin-category-select${compact ? ' is-compact' : ''}`}
        disabled={unavailable}
        onBlur={() => setOpen(false)}
        onClick={() => expanded ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="admin-category-select-label">{selected?.label ?? (options.length ? '选择分类' : '暂无分类')}</span>
        {selected?.count !== undefined && <span className="admin-category-count">{selected.count} 篇</span>}
        <ChevronDown aria-hidden="true" className="admin-category-chevron" size={16} />
      </button>
      {expanded && createPortal(
        <div
          className="admin-category-menu"
          ref={menuRef}
          style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
        >
          <div aria-hidden="true" className="admin-category-menu-heading">
            <span>{compact ? '迁移到分类' : '选择分类'}</span>
            {options.some((option) => option.count !== undefined) && <span>篇数</span>}
          </div>
          <div
            aria-label={ariaLabel}
            className="admin-category-options"
            id={menuId}
            ref={listRef}
            role="listbox"
          >
            {options.map((option, index) => (
              <div
                aria-selected={option.value === value}
                className={`admin-category-option${activeIndex === index ? ' is-active' : ''}`}
                id={`${menuId}-${index}`}
                key={option.value}
                onClick={() => chooseOption(index)}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
              >
                <span className="admin-category-check">{option.value === value && <Check aria-hidden="true" size={15} />}</span>
                <span className="admin-category-option-label">{option.label}</span>
                {option.count !== undefined && <span className="admin-category-count">{option.count}</span>}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
