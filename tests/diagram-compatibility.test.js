import test from "node:test";
import assert from "node:assert/strict";
import { prepareDiagramSource } from "../src/diagram-compatibility.js";

test("Sankey Unicode CSV maps repeated and quoted nodes without modifying source", () => {
  const source =
    'sankey-beta\n\n"中文,输入","编辑",20\n"编辑","正文\n后半",15\n"编辑","他说""你好""",5\n';
  const result = prepareDiagramSource(source);
  assert.equal(result.labels.size, 4);
  assert.match(result.source, /InkstoneSankeyNode0X,InkstoneSankeyNode1X,20/);
  assert.match(result.source, /InkstoneSankeyNode1X,InkstoneSankeyNode2X,15/);
  assert.equal(result.labels.get("InkstoneSankeyNode3X"), '他说"你好"');
  assert.equal(result.labels.get("InkstoneSankeyNode2X"), "正文\n后半");
  assert.ok(source.includes("中文,输入"));
  assert.ok(!source.includes("InkstoneSankey"));
});

test("ASCII, other diagrams and malformed CSV use original upstream validation", () => {
  for (const source of [
    "sankey\n\nA,B,2",
    "flowchart LR\nA[中文]-->B",
    "sankey\n中文,missing",
    "sankey\n中文,B,no-number",
    'sankey\n"中文",B,2,extra',
    'sankey\n"中文,B,2',
    'sankey\n"中文"x,B,2',
  ])
    assert.deepEqual(prepareDiagramSource(source), { source, labels: null });
});

test("Sankey mapping preserves directives and numeric values; label markup stays literal", () => {
  const prefix =
    "---\nconfig:\n  sankey:\n    showValues: false\n---\nsankey\n";
  const result = prepareDiagramSource(
    prefix + '%% 本地注释\n"<img onerror=alert(1)>中文",输出,1.5e2\n',
  );
  assert.ok(result.source.startsWith(prefix));
  assert.ok(result.source.includes(",1.5e2"));
  assert.equal(
    result.labels.get("InkstoneSankeyNode0X"),
    "<img onerror=alert(1)>中文",
  );
  assert.ok(!result.source.includes("<img"));
});
