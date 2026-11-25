
/* Presentation-only soft hyphens never leave the reader on copy. */
document.addEventListener('copy', function(event) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const viewport = document.getElementById('text-viewport');
  if (!viewport) return;
  const range = selection.getRangeAt(0);
  if (!viewport.contains(range.commonAncestorContainer)) return;
  const selected = selection.toString();
  if (!selected.includes('\u00ad')) return;
  if (!event.clipboardData) return;
  event.clipboardData.setData('text/plain', selected.replace(/\u00ad/g, ''));
  event.preventDefault();
});
