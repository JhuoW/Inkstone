// Render "·" separators as a light Latin middle dot (CJK fonts draw it full-width).
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const hits = [];
while (walker.nextNode()) {
  const n = walker.currentNode;
  if (n.nodeValue.includes("·") && !n.parentElement.closest(".mono, .tree, kbd, script")) hits.push(n);
}
for (const n of hits) {
  const frag = document.createDocumentFragment();
  n.nodeValue.split(/\s*·\s*/).forEach((part, i) => {
    if (i) { const d = document.createElement("i"); d.className = "ms"; d.textContent = "·"; frag.append(d); }
    frag.append(part);
  });
  n.replaceWith(frag);
}
// Report the full page height for render.sh once fonts have loaded.
document.fonts.ready.then(() => {
  document.documentElement.dataset.h = document.documentElement.scrollHeight;
});
