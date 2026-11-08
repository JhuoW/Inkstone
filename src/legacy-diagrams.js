import flowchart from "flowchart.js";
import SequenceDiagram from "./vendor/sequence-diagrams/sequence-diagram.js";
import DOMPurify from "dompurify";

// Retain the native hand-drawn geometry with local system text, including CJK.
// The upstream distribution's optional Daniel vector font is not bundled.
const NativeHandTheme = SequenceDiagram.themes.raphaelHand;
class UnicodeHandTheme extends NativeHandTheme {
  setupPaper(container) {
    SequenceDiagram.themes.raphaelSimple.prototype.setupPaper.call(
      this,
      container,
    );
  }
}
SequenceDiagram.themes.inkstoneHand = UnicodeHandTheme;

let diagramCounter = 0;
/** Native offline renderers for Typora's legacy flow/sequence grammars. */
export async function renderLegacyDiagram(kind, source, options = {}) {
  await document.fonts?.ready;
  const stage = document.createElement("div");
  stage.id = `inkstone-legacy-stage-${++diagramCounter}`;
  Object.assign(stage.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  stage.setAttribute("aria-hidden", "true");
  document.body.append(stage);
  let dispose;
  try {
    if (kind === "sequence") {
      const diagram = SequenceDiagram.parse(source);
      const drawing = diagram.drawSVG(stage, {
        theme: options.sequenceTheme === "hand" ? "inkstoneHand" : "simple",
        "font-size": 15,
        "font-family": "sans-serif",
      });
      dispose = () => drawing.paper_?.remove();
    } else {
      const diagram = flowchart.parse(source);
      if (!diagram.start)
        throw new Error("Flowchart must contain a connected start symbol.");
      diagram.drawSVG(stage, {
        "line-width": 2,
        "line-length": 42,
        "text-margin": 10,
        "font-size": 15,
        "font-family": "sans-serif",
        "font-color": "#263b40",
        "line-color": "#65777c",
        "element-color": "#65777c",
        fill: "#f7f9f8",
        flowstate: {
          past: { fill: "#e8edeb" },
          current: { fill: "#edf5de", "font-weight": "bold" },
          future: { fill: "#f6f2df" },
          request: { fill: "#ddeef7" },
          invalid: { fill: "#f7dfe2" },
          approved: { fill: "#dcf0e5" },
          rejected: { fill: "#f7dfe2" },
          ...(options.flowchartOptions?.flowstate || {}),
        },
        ...(options.flowchartOptions || {}),
      });
      dispose = () => diagram.clean();
    }
    const svg = stage.querySelector("svg");
    if (!svg) throw new Error("Legacy diagram renderer produced no SVG.");
    if (kind === "sequence")
      svg.setAttribute(
        "data-sequence-theme",
        options.sequenceTheme === "hand" ? "hand" : "simple",
      );
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!svg.hasAttribute("viewBox"))
      svg.setAttribute(
        "viewBox",
        `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`,
      );
    // Raphael shares marker definitions by document-wide ID. Expand internal <use> references
    // to local paths before sanitizing/exporting, then namespace IDs for independent SVG files.
    for (const use of svg.querySelectorAll("use")) {
      const reference =
        use.getAttribute("href") ||
        use.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      const target =
        reference?.startsWith("#") &&
        document.getElementById(reference.slice(1));
      if (!target || target.tagName.toLowerCase() !== "path") {
        use.remove();
        continue;
      }
      const copy = target.cloneNode(true);
      copy.removeAttribute("id");
      for (const attribute of use.attributes)
        if (!["href", "xlink:href"].includes(attribute.name))
          copy.setAttribute(attribute.name, attribute.value);
      use.replaceWith(copy);
    }
    const identifiers = new Map();
    for (const element of svg.querySelectorAll("[id]")) {
      const old = element.id;
      const next = `${stage.id}-${old}`;
      identifiers.set(old, next);
      element.id = next;
    }
    for (const element of svg.querySelectorAll("*"))
      for (const attribute of [...element.attributes]) {
        let value = attribute.value.replace(
          /url\(#([^)]+)\)/g,
          (_, id) => `url(#${identifiers.get(id) || id})`,
        );
        if (
          ["href", "xlink:href"].includes(attribute.name) &&
          value.startsWith("#")
        )
          value = "#" + (identifiers.get(value.slice(1)) || value.slice(1));
        if (value !== attribute.value)
          element.setAttribute(attribute.name, value);
      }
    const clean = DOMPurify.sanitize(svg.outerHTML, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_ATTR: ["dominant-baseline"],
      FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    });
    return clean;
  } finally {
    dispose?.();
    stage.remove();
  }
}
