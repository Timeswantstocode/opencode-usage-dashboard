'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './TooltipLayer.module.css';

/** Distance between the anchor and the panel. */
const GAP = 8;
/** Keep the panel this far inside the viewport on every side. */
const MARGIN = 8;

type Tip = {
  element: HTMLElement;
  /** Optional serif heading line. */
  title: string | null;
  /** Plain body text; `\n` splits lines. */
  body: string;
};

type Position = { left: number; top: number };

/**
 * One hover layer for the whole dashboard, replacing the native `title`
 * tooltip. Any element carrying `data-tip` (plus optional `data-tip-title`)
 * shows the panel above itself, flipping below when the top would clip and
 * clamping horizontally to the viewport. Delegated listeners mean components
 * stay plain markup and the panel never steals focus or pointer events.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active: HTMLElement | null = null;
    /** A click's own focus should not re-open the panel pointerdown just hid. */
    let pointerDownAt = 0;

    const resolve = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const element = target.closest<HTMLElement>('[data-tip]');
      return element && element.getAttribute('data-tip') ? element : null;
    };

    const show = (element: HTMLElement): void => {
      if (active === element) return;
      active = element;
      setPosition(null);
      setTip({
        element,
        title: element.getAttribute('data-tip-title'),
        body: element.getAttribute('data-tip') ?? '',
      });
    };

    const hide = (): void => {
      if (active === null) return;
      active = null;
      setTip(null);
      setPosition(null);
    };

    const onPointerOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      const element = resolve(event.target);
      if (element) show(element);
    };

    const onPointerOut = (event: PointerEvent): void => {
      const element = resolve(event.target);
      if (!element || element !== active) return;
      // Moving between children of the same anchor keeps the panel up.
      if (resolve(event.relatedTarget) === element) return;
      hide();
    };

    const onFocusIn = (event: FocusEvent): void => {
      if (Date.now() - pointerDownAt < 250) return;
      const element = resolve(event.target);
      if (element) show(element);
    };

    const onFocusOut = (event: FocusEvent): void => {
      const element = resolve(event.target);
      if (element && element === active) hide();
    };

    const onPointerDown = (): void => {
      pointerDownAt = Date.now();
      hide();
    };
    const onScroll = (): void => hide();
    const onResize = (): void => hide();

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Measuring needs the panel in the DOM, so the first paint is hidden at 0,0
  // and the placement lands on the next frame.
  useEffect(() => {
    if (!tip) return;
    if (!tip.element.isConnected) {
      setTip(null);
      return;
    }

    const anchor = tip.element.getBoundingClientRect();
    const panel = panelRef.current;
    if (!panel) return;

    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    const maxLeft = Math.max(MARGIN, viewportWidth - width - MARGIN);
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, MARGIN), maxLeft);

    let top = anchor.top - height - GAP;
    if (top < MARGIN) top = anchor.bottom + GAP;
    if (top + height > viewportHeight - MARGIN) {
      top = Math.max(MARGIN, viewportHeight - height - MARGIN);
    }

    setPosition({ left, top });
  }, [tip]);

  if (!tip) return null;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="tooltip"
      style={{
        left: position ? `${position.left}px` : 0,
        top: position ? `${position.top}px` : 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {tip.title ? <div className={styles.title}>{tip.title}</div> : null}
      <div className={styles.body}>{tip.body}</div>
    </div>
  );
}
