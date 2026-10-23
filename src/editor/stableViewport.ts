import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

/** Hold the visible paragraph through delayed image/diagram layout; user motion resets it. */
export const stableViewport = ViewPlugin.fromClass(class {
  private anchor: { position: number; y: number } | null = null;
  private observer: ResizeObserver;
  private frame = 0;
  private refresh = true;
  private writingUntil = 0;
  private dead = false;
  constructor(private view: EditorView) {
    this.observer = new ResizeObserver(() => this.schedule(false));
    this.observer.observe(view.contentDOM);
    view.scrollDOM.addEventListener('scroll', this.scroll, { passive: true });
    view.scrollDOM.addEventListener('wheel', this.motion, { passive: true });
    view.scrollDOM.addEventListener('touchstart', this.motion, { passive: true });
    this.schedule(true);
  }
  private motion = () => { this.writingUntil = 0; this.schedule(true); };
  private scroll = () => { if (performance.now() > this.writingUntil) this.schedule(true); };
  update(update: ViewUpdate) {
    if (update.docChanged && this.anchor) this.anchor.position = update.changes.mapPos(this.anchor.position);
    if (update.docChanged || update.selectionSet || update.focusChanged) this.schedule(true);
  }
  private schedule(refresh: boolean) {
    this.refresh ||= refresh;
    if (this.frame || this.dead) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0; if (this.dead) return;
      this.view.requestMeasure({ key: this, read: view => {
        const bounds = view.scrollDOM.getBoundingClientRect();
        if (this.refresh || !this.anchor || view.composing) {
          this.refresh = false;
          const head = view.state.selection.main.head, caret = view.coordsAtPos(head);
          const position = caret && caret.top >= bounds.top && caret.bottom <= bounds.bottom ? head : view.posAtCoords({ x: bounds.left + bounds.width / 2, y: bounds.top + 24 }, false);
          const coords = position === null ? null : view.coordsAtPos(position);
          this.anchor = coords && position !== null ? { position, y: coords.top - bounds.top } : null;
          return 0;
        }
        const coords = view.coordsAtPos(this.anchor.position);
        return coords ? coords.top - bounds.top - this.anchor.y : 0;
      }, write: delta => {
        if (this.dead || Math.abs(delta) < 1 || !this.anchor || this.view.composing) return;
        this.writingUntil = performance.now() + 80;
        this.view.scrollDOM.scrollTop += delta;
      } });
    });
  }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.view.scrollDOM.removeEventListener('scroll', this.scroll); this.view.scrollDOM.removeEventListener('wheel', this.motion); this.view.scrollDOM.removeEventListener('touchstart', this.motion);
  }
});
