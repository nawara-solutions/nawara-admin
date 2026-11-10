"""Extract approved scope symbols without redrawing. Reuses the existing blue-leaf layer pipeline.
Usage: python3 -B tools/brand/extract_scope_symbols.py <logo-suite.png> <drive-school.png>
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from extract_blue_leaf import extract, split_layers, to_image

DEST = Path(__file__).resolve().parents[2] / 'public/brand'
SPECS = {
    'solutions': (0, (1461, 121, 1688, 309), (1580, 145, 1657, 220)),
    'drive': (1, (407, 369, 585, 539), (500, 390, 567, 462)),
    'school': (1, (1161, 369, 1342, 539), (1250, 385, 1327, 453)),
}
boards = [np.asarray(Image.open(path).convert('RGB')) for path in sys.argv[1:3]]
for name, (source, box, glyph) in SPECS.items():
    rgba, interior = extract(boards[source], {'box': box, 'glyph': glyph})
    _, mask, details = split_layers(rgba, interior)
    for suffix, layer in [('mask', mask), ('details', details)]:
        to_image(layer).save(DEST / f'nawara-scope-{name}-{suffix}.webp', lossless=True)
