/** Offline TeX compatibility fallback. No component loader, remote scripts, or font requests. */
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const packages = [
  ...AllPackages.filter(
    (name) =>
      ![
        "noerrors",
        "noundefined",
        "autoload",
        "require",
        "setoptions",
      ].includes(name),
  ),
  "physics",
];
const cache = new Map();
let cachedCharacters = 0;
export function renderMathJax(
  source,
  { displayMode = false, macros = {} } = {},
) {
  if (source.length > 32768)
    throw new Error("Formula exceeds the 32 KiB rendering limit.");
  const key = JSON.stringify([source, displayMode, macros]);
  if (cache.has(key)) return cache.get(key);
  // A fresh input processor prevents \newcommand definitions leaking between documents.
  const input = new TeX({
    packages,
    tags: "none",
    macros,
    maxBuffer: 32768,
    maxMacros: 1000,
    formatError: (_jax, error) => {
      throw new Error(error.message);
    },
  });
  const output = new SVG({ fontCache: "none" });
  const document = mathjax.document("", { InputJax: input, OutputJax: output });
  const node = document.convert(source, {
    display: displayMode,
    em: 16,
    ex: 8,
    containerWidth: 1280,
  });
  const svg = adaptor.innerHTML(node);
  if (!svg.includes("<svg")) throw new Error("MathJax produced no SVG.");
  cache.set(key, svg);
  cachedCharacters += svg.length;
  while (
    (cachedCharacters > 8 * 1024 * 1024 || cache.size > 150) &&
    cache.size > 1
  ) {
    const oldest = cache.keys().next().value;
    cachedCharacters -= cache.get(oldest).length;
    cache.delete(oldest);
  }
  return svg;
}
