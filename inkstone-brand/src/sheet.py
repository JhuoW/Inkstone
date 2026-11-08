"""Self-contained brand sheet (brand-sheet.html) built from the exported assets."""
import base64, os


def _uri(path, mime):
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()


def build(root):
    L = lambda n: _uri(os.path.join(root, "logo", "svg", n + ".svg"), "image/svg+xml")
    I = lambda n: _uri(os.path.join(root, "icon", "svg", n + ".svg"), "image/svg+xml")
    P = lambda s: _uri(os.path.join(root, "icon", "png", f"inkstone-icon-{s}.png"), "image/png")
    W = lambda s: _uri(os.path.join(root, "icon", "windows", "png", f"inkstone-{s}.png"), "image/png")

    ladder = "".join(f'<figure class="sz"><img src="{P(s)}" width="{min(s, 256)}" height="{min(s, 256)}" alt="{s}px">'
                     f'<figcaption>{s}</figcaption></figure>' for s in (256, 128, 64, 48, 32, 16))
    tiny = "".join(f'<figure class="sz"><img class="px" src="{W(s)}" width="{s*4}" height="{s*4}" alt="{s}px at 4x">'
                   f'<figcaption>{s} px · 4×</figcaption></figure>' for s in (16, 24, 32))
    sw = [("墨 Ink", "#1C1A21", "28 26 33", "Logo, text, the stone"),
          ("宣 Paper", "#F4F0E6", "244 240 230", "Backgrounds, the well"),
          ("石 Stone", "#76717D", "118 113 125", "Secondary text, rules"),
          ("朱 Vermilion", "#C8402B", "200 64 43", "Seal & sparing accents")]
    swatches = "".join(f'<div class="sw"><div class="chip" style="background:{h}"></div><b>{n}</b>'
                       f'<code>{h}</code><span>RGB {r}</span><span>{u}</span></div>' for n, h, r, u in sw)

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inkstone Brand Kit</title>
<link rel="icon" href="{_uri(os.path.join(root, 'icon', 'web', 'favicon.svg'), 'image/svg+xml')}">
<style>
:root{{--ink:#1C1A21;--paper:#F4F0E6;--stone:#76717D;--verm:#C8402B;--page:#FBFAF6;--line:#E4DFD3;--card:#FFFFFF;--text:#1C1A21;--muted:#6F6A76}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--page:#141217;--line:#2A2730;--card:#1C1A21;--text:#EDE8DE;--muted:#9C97A3}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--page);color:var(--text);font:15px/1.6 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 24px}}
header{{background:var(--ink);color:var(--paper);padding:96px 0 72px}}
header img{{width:min(720px,100%);display:block}}
header p{{color:#B9B3C1;max-width:560px;margin:28px 0 0}}
h2{{font:600 13px/1 -apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 20px}}
h3{{font:600 17px/1.3 "Noto Serif SC","Source Han Serif SC",Georgia,serif;margin:0 0 6px}}
section{{padding:64px 0;border-bottom:1px solid var(--line)}}
.grid{{display:grid;gap:20px}}
.g2{{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}}
.g3{{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px;min-width:0}}
.stage{{border-radius:16px;display:flex;align-items:center;justify-content:center;padding:48px 32px;min-height:220px}}
.stage img{{max-width:100%;height:auto}}
.on-paper{{background:var(--paper)}} .on-ink{{background:var(--ink)}} .on-grey{{background:#E9E6DF}}
.cap{{color:var(--muted);font-size:13px;margin-top:10px}}
.concept p{{color:var(--muted);margin:0}}
.ladder{{display:flex;flex-wrap:wrap;align-items:flex-end;gap:28px}}
.sz{{margin:0;text-align:center}} .sz figcaption{{color:var(--muted);font-size:12px;margin-top:8px}}
.px{{image-rendering:pixelated}}
.dock{{background:linear-gradient(135deg,#6E7FA8,#C9A9B8 55%,#E8C7A0);border-radius:20px;padding:56px 24px 28px;display:flex;justify-content:center}}
.dock .bar{{display:flex;gap:14px;padding:12px 16px;border-radius:24px;background:rgba(255,255,255,.28);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.4)}}
.dock .app{{width:72px;height:72px;border-radius:17px}}
.sw{{display:flex;flex-direction:column;gap:2px}} .chip{{height:96px;border-radius:12px;border:1px solid var(--line);margin-bottom:10px}}
.sw code{{font:13px ui-monospace,Consolas,monospace}} .sw span{{color:var(--muted);font-size:13px}}
.spec{{font-family:"Noto Serif SC","Source Han Serif SC",Georgia,serif;font-size:44px;line-height:1.25;font-weight:600;margin:6px 0 12px;overflow-wrap:anywhere}}
ul.rules{{margin:0;padding-left:18px;color:var(--muted)}} ul.rules li{{margin:4px 0}}
pre{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;overflow:auto;font:13px/1.55 ui-monospace,Consolas,monospace}}
footer{{padding:40px 0 64px;color:var(--muted);font-size:13px}}
</style></head><body>
<header><div class="wrap">
<img src="{L('inkstone-logo-horizontal-reversed')}" alt="Inkstone 墨石">
<p>Brand &amp; app icon kit, v1.0. A free-form inkstone with a drop-shaped ink well: a calm, tactile object for a writing app.</p>
</div></header>

<main class="wrap">
<section><h2>Concept</h2>
<div class="grid g3 concept">
<div><h3>The stone · 随形砚</h3><p>Free-form inkstones keep the natural outline of a river stone. The mark is a softly squared pebble, a touch fuller at its base, resting at a slight 8° tilt.</p></div>
<div><h3>The well · 墨池</h3><p>Every inkstone has a well where ground ink gathers. Here it is a single drop, set high in the stone like a real well. It is the one thing your eye goes to, much as your writing is in the editor.</p></div>
<div><h3>The drop in the i</h3><p>The same drop replaces the dot of the <i>i</i> in the wordmark at the same 8° tilt, so the mark and the name share one shape.</p></div>
</div></section>

<section><h2>Primary logo</h2>
<div class="grid g2">
<div><div class="stage on-paper"><img src="{L('inkstone-logo-horizontal')}" alt="Inkstone logo on paper"></div><div class="cap">inkstone-logo-horizontal · on Paper</div></div>
<div><div class="stage on-ink"><img src="{L('inkstone-logo-horizontal-reversed')}" alt="Inkstone logo on ink"></div><div class="cap">inkstone-logo-horizontal-reversed · on Ink</div></div>
</div></section>

<section><h2>Lockups &amp; marks</h2>
<div class="grid g3">
<div><div class="stage on-paper"><img src="{L('inkstone-mark')}" width="160" alt="Mark"></div><div class="cap">inkstone-mark</div></div>
<div><div class="stage on-paper"><img src="{L('inkstone-logo-stacked')}" width="220" alt="Stacked"></div><div class="cap">inkstone-logo-stacked</div></div>
<div><div class="stage on-paper"><img src="{L('inkstone-logo-zh')}" width="260" alt="Chinese lockup"></div><div class="cap">inkstone-logo-zh · for Chinese-language contexts</div></div>
<div><div class="stage on-paper"><img src="{L('inkstone-logo-horizontal-en')}" width="300" alt="English lockup"></div><div class="cap">inkstone-logo-horizontal-en</div></div>
<div><div class="stage on-paper"><img src="{L('inkstone-wordmark')}" width="260" alt="Wordmark"></div><div class="cap">inkstone-wordmark</div></div>
<div><div class="stage on-paper"><img src="{L('inkstone-seal')}" width="96" alt="Seal"></div><div class="cap">inkstone-seal · a vermilion chop for splash screens, the About window and print</div></div>
</div></section>

<section><h2>App icon</h2>
<div class="grid g2">
<div><div class="stage on-grey"><img src="{I('inkstone-icon')}" width="300" alt="Light icon"></div><div class="cap">inkstone-icon (default) · macOS grid, 824 px tile on a 1024 px canvas</div></div>
<div><div class="stage on-grey"><img src="{I('inkstone-icon-dark')}" width="300" alt="Dark icon"></div><div class="cap">inkstone-icon-dark · dark appearance / alternate icon</div></div>
</div>
<div class="card" style="margin-top:20px"><h3>Size ladder</h3><p class="cap" style="margin:0 0 20px">At 32 px and below a simplified drawing takes over: a bigger stone, a bigger well, no lighting effects.</p>
<div class="ladder">{ladder}</div>
<div class="ladder" style="margin-top:28px">{tiny}</div></div>
<div class="dock" style="margin-top:20px"><div class="bar">
<img class="app" src="{I('inkstone-icon')}" alt=""><img class="app" src="{I('inkstone-icon-dark')}" alt="">
</div></div>
</section>

<section><h2>Colour</h2><div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">{swatches}</div></section>

<section><h2>Type</h2>
<div class="grid g2">
<div class="card"><h3>Wordmark</h3><div class="spec">inkstone 墨石</div>
<p class="cap" style="margin:0">Drawn from Noto Serif SC (Source Han Serif) SemiBold, with Medium for 墨石. Licensed under SIL OFL 1.1, which allows use in logos. Every letter is converted to outlines, so the logo files need no fonts.</p></div>
<div class="card"><h3>Suggested UI pairing</h3>
<p class="cap" style="margin:0">Use the system UI font for app chrome (SF Pro, Segoe UI, PingFang SC, Microsoft YaHei). Offer Noto Serif SC or Source Han Serif as a reading font, so the editor sounds like its name.</p></div>
</div></section>

<section><h2>Usage</h2>
<div class="grid g2">
<div class="card"><h3>Clear space &amp; minimum size</h3><ul class="rules">
<li>Keep clear space around any logo at least the width of the well (the drop).</li>
<li>Mark: at least 16 px. Horizontal logo: at least 120 px wide. Stacked logo: at least 64 px wide.</li>
<li>Below 32 px, use the <code>-small</code> icon art, not a scaled-down master.</li></ul></div>
<div class="card"><h3>Please don't</h3><ul class="rules">
<li>Recolour the drop or fill it with vermilion. Red drops read as blood.</li>
<li>Re-tilt, outline, stretch or add effects to the flat logo. Lighting belongs to the app icon only.</li>
<li>Set "inkstone" in another typeface, or swap the drop for a round dot.</li></ul></div>
</div></section>

<section><h2>Files</h2>
<pre>inkstone-brand/
├─ logo/svg, logo/png        mark, horizontal (± 墨石), stacked, zh, wordmark, seal; ink + reversed
├─ icon/svg                  inkstone-icon(-dark), -square (iOS / maskable), -small (≤32 px), layers/
├─ icon/png                  inkstone-icon-16 … 1024, dark 256 / 512 / 1024
├─ icon/macos                Inkstone.icns + Inkstone.iconset/
├─ icon/windows              Inkstone.ico (16–256) + png/
├─ icon/web                  favicon.svg (auto dark mode), favicon.ico, apple-touch-icon, PWA icons, site.webmanifest
└─ src/                      build.py regenerates everything from code</pre>
</section>
</main>
<footer class="wrap">Inkstone 墨石 · brand kit v1.0</footer>
</body></html>
"""
    with open(os.path.join(root, "brand-sheet.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
