"""Rebuild the two local webfont subsets from installed Noto SC variable fonts.

Usage: python website/tools/build-fonts.py C:/Windows/Fonts
Requires fonttools and brotli. No runtime dependency for the website.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import sys

site = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
text = ''.join(p.read_text(encoding='utf8') for p in site.glob('*.html'))
text += ''.join(chr(i) for i in range(32, 127))
output = site / 'assets' / 'fonts'
output.mkdir(parents=True, exist_ok=True)
notices = []
for kind in ('Sans', 'Serif'):
    font = TTFont(source / f'Noto{kind}SC-VF.ttf')
    notices.append(f'Noto {kind} SC: {font["name"].getDebugName(0)}')
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    options.name_legacy = True
    options.name_languages = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(text=text)
    sub.subset(font)
    family = f'Inkstone Website {kind}'
    replacements = {1: family, 2: 'Regular', 3: family+'-Subset', 4: family,
                    6: f'InkstoneWebsite{kind}', 16: family, 17: 'Regular'}
    for record in font['name'].names:
        if record.nameID in replacements:
            record.string = replacements[record.nameID].encode(record.getEncoding())
    font.flavor = 'woff2'
    target = output / f'site-{kind.lower()}.woff2'
    font.save(target)
    print(f'{target.name}: {target.stat().st_size:,} bytes')
(output / 'NOTICE.txt').write_text('\n'.join(notices) + '\n\n'
    'Subsets of the installed Noto SC variable fonts, renamed Inkstone Website Sans / Serif.\n'
    'Only glyphs used by index.html and zh.html plus printable ASCII are retained.\n'
    'Font license: SIL Open Font License 1.1 (OFL.txt).\n'
    'Upstream: https://github.com/notofonts/noto-cjk\n', encoding='utf8')
