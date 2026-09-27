// In-call badge shown while the consultation audio is being recorded.
// Top-centre of the call area: the left edge holds the focus-layout
// thumbnails and the top-right corner each tile's focus toggle. The parent
// must be `position: relative` (it's the fullscreen container, so the badge
// stays visible in fullscreen too).
export const RecordingIndicator = () => (
  <div
    role="status"
    aria-live="polite"
    title="Консультація записується — лише аудіо, відео не зберігається"
    className="pointer-events-none absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur-sm"
  >
    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
    Іде аудіозапис
  </div>
);
