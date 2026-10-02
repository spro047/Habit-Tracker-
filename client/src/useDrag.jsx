import { useRef, useState } from 'react';

// Pointer-based drag-to-reorder that works on mouse AND touch.
// Attach handleProps to a grip element, itemProps to each row, and mark the
// list container with data-drag-list.
export function useDragReorder(onReorder) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const state = useRef(null);
  const suppressClick = useRef(false);

  const handleProps = index => ({
    onPointerDown: e => {
      e.preventDefault();
      e.stopPropagation();
      const card = e.currentTarget.closest('[data-drag-item]');
      if (!card) return;
      state.current = {
        index,
        card,
        rect: card.getBoundingClientRect(),
        startY: e.clientY,
        moved: false,
        target: index,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setDragIndex(index);
    },
    onPointerMove: e => {
      const s = state.current;
      if (!s) return;
      const dy = e.clientY - s.startY;
      if (Math.abs(dy) > 5) s.moved = true;
      s.card.style.transform = `translateY(${dy}px)`;
      const list = s.card.closest('[data-drag-list]');
      if (!list) return;
      const cards = Array.from(list.querySelectorAll('[data-drag-item]'));
      const midY = s.rect.top + dy + s.rect.height / 2;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (midY >= r.top && midY <= r.bottom) {
          s.target = i;
          break;
        }
      }
      setOverIndex(s.target);
    },
    onPointerUp: () => {
      const s = state.current;
      if (!s) return;
      state.current = null;
      s.card.style.transform = '';
      const from = s.index;
      const to = s.target;
      setDragIndex(null);
      setOverIndex(null);
      if (s.moved) {
        suppressClick.current = true;
        if (from !== null && to !== null && from !== to) onReorder(from, to);
      }
    },
    onPointerCancel: () => {
      const s = state.current;
      if (!s) return;
      state.current = null;
      s.card.style.transform = '';
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const itemProps = () => ({
    'data-drag-item': true,
    onClickCapture: e => {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });

  return { dragIndex, overIndex, handleProps, itemProps };
}