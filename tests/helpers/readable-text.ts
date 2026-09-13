/** Runs in the browser. Visible glyph overhang is valid; actual clipping is not. */
export function inspectReadableText(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const text = range.getBoundingClientRect();
  const clippedBy: string[] = [];
  const clippingValues = ['hidden', 'clip', 'auto', 'scroll'];
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    const box = ancestor.getBoundingClientRect();
    const left = box.left + ancestor.clientLeft;
    const top = box.top + ancestor.clientTop;
    const label = ancestor.tagName.toLowerCase() + (ancestor.id ? `#${ancestor.id}` : '');
    if (style.textOverflow === 'ellipsis' || !['none', '0', ''].includes(style.webkitLineClamp)) clippedBy.push(`${label}: truncation style`);
    if (clippingValues.includes(style.overflowX) && (text.left < left - 1 || text.right > left + ancestor.clientWidth + 1)) clippedBy.push(`${label}: horizontal clip`);
    if (clippingValues.includes(style.overflowY) && (text.top < top - 1 || text.bottom > top + ancestor.clientHeight + 1)) clippedBy.push(`${label}: vertical clip`);
  }
  const style = getComputedStyle(element);
  return {
    readable: clippedBy.length === 0 && text.left >= -1 && text.right <= innerWidth + 1,
    clippedBy,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: style.overflowY,
    textBounds: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
  };
}
