/**
 * Map a bottom-based transcript offset onto a one-column scrollbar thumb.
 */

export type ScrollbarThumb = {
  start: number;
  size: number;
};

/** Place the thumb along a track. Hidden when content fits. */
export function scrollbarThumb(options: {
  trackRows: number;
  contentRows: number;
  scrollOffset: number;
}): ScrollbarThumb | undefined {
  const track = Math.max(0, Math.trunc(options.trackRows));
  const content = Math.max(0, Math.trunc(options.contentRows));
  if (track < 1 || content <= track) return undefined;

  const maxOffset = content - track;
  const offset = Math.max(
    0,
    Math.min(maxOffset, Math.trunc(options.scrollOffset)),
  );
  const size = Math.max(
    1,
    Math.min(track, Math.round((track * track) / content)),
  );
  const travel = track - size;
  const start = Math.round(((maxOffset - offset) / maxOffset) * travel);
  return {
    start: Math.max(0, Math.min(travel, start)),
    size,
  };
}
