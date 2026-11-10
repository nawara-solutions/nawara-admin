"""Trace the Owner's botanical concept symbol into an alpha-mask SVG.

Usage: python3 tools/brand/trace_admin_flower.py '/path/to/Nawara Admin Botanical Flower Logo.png'
The crop excludes all lettering. Contours preserve the supplied silhouette, glyph, and holes;
no independently drawn replacement geometry or embedded raster is used.
"""
import sys
from collections import defaultdict
from pathlib import Path
from PIL import Image

image = Image.open(sys.argv[1]).convert('RGB')
assert image.size == (1975, 796), 'Expected the approved 1975 × 796 concept board'
points = set()
for y in range(250, 550):
    for x in range(160, 515):
        r, g, b = image.getpixel((x, y))
        if r - g > 100 and r - b > 60:
            points.add((x, y))
x0 = min(x for x, y in points) - 2
y0 = min(y for x, y in points) - 2
width = max(x for x, y in points) - x0 + 3
height = max(y for x, y in points) - y0 + 3
edges = defaultdict(list)
for x, y in sorted(points):
    for neighbor, a, b in [((x,y-1),(x,y),(x+1,y)), ((x+1,y),(x+1,y),(x+1,y+1)), ((x,y+1),(x+1,y+1),(x,y+1)), ((x-1,y),(x,y+1),(x,y))]:
        if neighbor not in points:
            edges[a].append(b)

def simplify(p, tolerance=.65):
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    den = dx*dx+dy*dy
    distances = []
    for x,y in p[1:-1]:
        t = max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/den)) if den else 0
        distances.append((x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2)
    m = max(distances)
    if m <= tolerance*tolerance:
        return [a,b]
    i = distances.index(m)+1
    return simplify(p[:i+1])[:-1]+simplify(p[i:])

paths = []
while edges:
    first = min(edges)
    chain = [first]
    current = first
    while True:
        nxt = edges[current].pop()
        if not edges[current]:
            del edges[current]
        chain.append(nxt)
        current = nxt
        if current == first:
            break
    if len(chain) < 12:
        continue
    chain = simplify(chain)
    paths.append('M'+' '.join(f'{x-x0},{y-y0}' for x,y in chain[:-1])+'Z')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">\n  <path fill="#fff" fill-rule="evenodd" d="'+ ' '.join(paths)+'" />\n</svg>\n'
Path('public/brand/nawara-admin-flower-mask.svg').write_text(svg)
print(f'Traced {len(paths)} contours; viewBox {width} × {height}; source origin {x0},{y0}')
