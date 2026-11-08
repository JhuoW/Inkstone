import { markdownLanguage } from "@codemirror/lang-markdown";

function blockGroup(text, selection, blocks) {
  const ordered = blocks
    .map((block) => ({
      ...block,
      to:
        block.from +
        text.slice(block.from, block.to).replace(/(?:\n[ \t]*)+$/, "").length,
    }))
    .sort((a, b) => a.from - b.from);
  let indices = ordered
    .map((block, index) => ({ block, index }))
    .filter(({ block }) =>
      selection.from === selection.to
        ? selection.head >= block.from && selection.head <= block.to
        : selection.from < block.to && selection.to > block.from,
    );
  if (!indices.length) {
    const previous = ordered.findLastIndex(
      (block) => block.to <= selection.head,
    );
    const index = previous >= 0 ? previous : 0;
    if (ordered[index]) indices = [{ block: ordered[index], index }];
  }
  if (!indices.length) return null;
  return {
    blocks: ordered,
    first: indices[0].index,
    last: indices.at(-1).index,
    from: indices[0].block.from,
    to: indices.at(-1).block.to,
  };
}
export function structuralEdit(
  text,
  selection,
  blocks,
  command,
  locale = "zh-CN",
) {
  const group = blockGroup(text, selection, blocks);
  if (command === "deleteBlock") {
    if (!group) return null;
    let from = group.from,
      to = group.to;
    if (group.last < group.blocks.length - 1)
      to = group.blocks[group.last + 1].from;
    else if (group.first > 0) from = group.blocks[group.first - 1].to;
    else {
      from = 0;
      to = text.length;
    }
    return { changes: { from, to, insert: "" }, selection: { anchor: from } };
  }
  if (command === "moveParagraphUp" || command === "moveParagraphDown") {
    if (!group) return null;
    const up = command === "moveParagraphUp",
      neighbor = group.blocks[up ? group.first - 1 : group.last + 1];
    if (!neighbor) return null;
    const from = up ? neighbor.from : group.from,
      to = up ? group.to : neighbor.to;
    const separator = up
      ? [neighbor.to, group.from]
      : [group.to, neighbor.from];
    const rawParts = up
      ? [[group.from, group.to], separator, [neighbor.from, neighbor.to]]
      : [[neighbor.from, neighbor.to], separator, [group.from, group.to]];
    const insert = rawParts
      .map(([start, end]) => text.slice(start, end))
      .join("");
    const movedFrom = up
      ? from
      : from + neighbor.to - neighbor.from + separator[1] - separator[0];
    const map = (position) =>
      movedFrom +
      Math.max(0, Math.min(group.to - group.from, position - group.from));
    return {
      changes: { from, to, insert },
      selection: { anchor: map(selection.anchor), head: map(selection.head) },
      rawParts,
    };
  }
  if (command === "deleteWord" || command === "deleteSentence") {
    if (selection.from !== selection.to)
      return {
        changes: { from: selection.from, to: selection.to, insert: "" },
        selection: { anchor: selection.from },
      };
    const from = group?.from ?? 0,
      to = group?.to ?? text.length;
    const part = text.slice(from, to),
      position = Math.max(0, Math.min(part.length, selection.head - from));
    const segments = [
      ...new Intl.Segmenter(locale, {
        granularity: command === "deleteWord" ? "word" : "sentence",
      }).segment(part),
    ].filter((segment) => command !== "deleteWord" || segment.isWordLike);
    const segment =
      segments.find(
        (segment) =>
          position >= segment.index &&
          position < segment.index + segment.segment.length,
      ) ||
      segments.findLast(
        (segment) => segment.index + segment.segment.length <= position,
      ) ||
      segments[0];
    if (!segment) return null;
    return {
      changes: {
        from: from + segment.index,
        to: from + segment.index + segment.segment.length,
        insert: "",
      },
      selection: { anchor: from + segment.index },
    };
  }
  if (command === "clearFormatting" || command === "deleteStyle") {
    if (!group) return null;
    const content = text.slice(group.from, group.to),
      candidates = [];
    markdownLanguage.parser.parse(content).iterate({
      enter(node) {
        if (
          ![
            "StrongEmphasis",
            "Emphasis",
            "InlineCode",
            "Strikethrough",
            "Link",
          ].includes(node.name)
        )
          return;
        const start = group.from + node.from,
          end = group.from + node.to;
        const encloses = start <= selection.from && end >= selection.to;
        const included =
          selection.from < selection.to &&
          start >= selection.from &&
          end <= selection.to;
        if (!encloses && !included) return;
        const children = [];
        for (let child = node.node.firstChild; child; child = child.nextSibling)
          children.push(child);
        let boundaries;
        if (node.name === "Link") {
          const close = children.find(
            (child) =>
              child.name === "LinkMark" &&
              content.slice(child.from, child.to) === "]",
          );
          if (close)
            boundaries = [
              [node.from, node.from + 1],
              [close.from, node.to],
            ];
        } else if (children.length >= 2)
          boundaries = [
            [children[0].from, children[0].to],
            [children.at(-1).from, children.at(-1).to],
          ];
        if (boundaries) candidates.push({ start, end, encloses, boundaries });
      },
    });
    const enclosing = candidates
      .filter((candidate) => candidate.encloses)
      .sort((a, b) => a.end - a.start - (b.end - b.start));
    const chosen =
      selection.empty || selection.from === selection.to
        ? enclosing.slice(0, 1)
        : candidates;
    const unique = new Map();
    for (const candidate of chosen)
      for (const [from, to] of candidate.boundaries)
        unique.set(from + ":" + to, {
          from: group.from + from,
          to: group.from + to,
          insert: "",
        });
    const changes = [...unique.values()].sort((a, b) => a.from - b.from);
    return changes.length ? { changes } : null;
  }
  return null;
}
