import { parseDocument, isMap, isScalar } from "yaml";

/** Read a narrow, non-executable subset of document settings. Never rewrite YAML/source. */
export function readDocumentConfig(text = "") {
  const source = String(text).replace(/^\uFEFF/, "");
  if (!/^---(?:\r\n|\n|\r)/.test(source)) return {};
  // Bound metadata work and avoid parsing the rest of a very large document while typing.
  const header = source
    .slice(0, 65536)
    .match(
      /^---(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)(?:---|\.\.\.)(?=\r\n|\n|\r|$)/,
    );
  if (!header) return {};
  try {
    const yaml = parseDocument(header[1], {
      schema: "core",
      uniqueKeys: true,
      strict: true,
      prettyErrors: false,
    });
    if (yaml.errors.length || yaml.warnings.length || !isMap(yaml.contents))
      return {};
    const result = {};
    for (const [key, option] of [
      ["typora-root-url", "imageRoot"],
      ["typora-copy-images-to", "imageFolder"],
    ]) {
      // Access scalar nodes directly: aliases, custom tags, objects and executable values never expand.
      const node = yaml.get(key, true);
      if (
        isScalar(node) &&
        typeof node.value === "string" &&
        node.value.length <= 4096 &&
        !/[\x00-\x1f]/.test(node.value) &&
        (!node.tag || node.tag === "tag:yaml.org,2002:str")
      ) {
        const value = node.value.trim();
        if (value) result[option] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}
