"""
Builds public/roles/: one small WebP icon per character of data/characters.json, and the logos of the base scripts and
the Carousel (with a thumbnail of each), from a clone of the French wiki's repository
(https://github.com/BambiPotato/botc-fr-bambi), which holds the official icons in images/Icon_<name>.png.

    git clone --depth 1 https://github.com/BambiPotato/botc-fr-bambi /tmp/botc-fr-bambi
    python3 -m venv /tmp/icons && /tmp/icons/bin/pip install Pillow
    /tmp/icons/bin/python -I scripts/build-role-icons.py /tmp/botc-fr-bambi

It also writes data/role-art.json (the icons there are and the logos' sizes) and the exact names of these files in the
proxy's matcher (proxy.ts), so that they skip the proxy like every other static file. The icons and logos belong to
The Pandemonium Institute (see the README): rerun it when roles are added to data/characters.json, and read the list
of missing icons it prints.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'roles'
ICON_SIZE = 128  # shown at 56 px or less: sharp on a screen of density 2
LOGO_WIDTH = 300  # shown at 240 px wide or less
THUMB_SIZE = 112  # the script cards show 56 px
# The logos the pages show, by edition (lib/characters.ts), with the file that holds each in the wiki's images.
LOGOS = {'tb': 'Logo_trouble_brewing.png', 'bmr': 'Logo_bad_moon_rising-1.png', 'snv': 'Logo_sects_and_violets.png', 'carousel': 'carousel.png'}
MATCHER = re.compile(r"roles/\(\?:[a-z0-9|]*\)\\\\\.webp\$\|roles/editions/\(\?:[a-z0-9|]*\)\(\?:-small\)\?\\\\\.webp\$")


def character_id(value: str) -> str:
    """As lib/scripts.ts characterId: lower case letters and digits only."""
    plain = unicodedata.normalize('NFD', value)
    plain = ''.join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', plain.lower())


def save(source: Path, target: Path, size: tuple[int, int]) -> tuple[int, int]:
    image = Image.open(source).convert('RGBA')
    # Trim the transparent margin, so that every icon fills its box the same way.
    box = image.getchannel('A').getbbox()
    if box:
        image = image.crop(box)
    image.thumbnail(size, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, 'WEBP', quality=82, method=6)
    return image.size


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('Usage: python -I scripts/build-role-icons.py <clone of botc-fr-bambi>')
    images = Path(sys.argv[1]) / 'images'
    absent = [name for name in LOGOS.values() if not (images / name).is_file()]
    if absent:
        sys.exit(f'Logos not found in {images}: ' + ', '.join(absent))
    characters = json.loads((ROOT / 'data' / 'characters.json').read_text(encoding='utf-8'))['characters']
    # Icon_drunk-1.png is the Drunk's icon when no Icon_drunk.png exists: an unsuffixed file wins.
    files = [p for p in images.iterdir() if re.fullmatch(r'icon_.+\.png', p.name, re.IGNORECASE)]
    icons: dict[str, Path] = {}
    for path in sorted(files, key=lambda p: (p.stem.endswith('-1'), p.name.lower())):
        icons.setdefault(character_id(re.sub(r'-1$', '', path.stem[len('Icon_'):])), path)
    # Icons of characters gone from the list go too: the folder holds exactly what the pages show.
    for old in OUT.rglob('*.webp'):
        old.unlink()
    written, missing = [], []
    for character in characters:
        source = icons.get(character['id'])
        if source is None:
            missing.append(character['id'])
            continue
        save(source, OUT / f"{character['id']}.webp", (ICON_SIZE, ICON_SIZE))
        written.append(character['id'])
    logos = {}
    for edition, name in LOGOS.items():
        width, height = save(images / name, OUT / 'editions' / f'{edition}.webp', (LOGO_WIDTH, LOGO_WIDTH))
        thumb_width, thumb_height = save(images / name, OUT / 'editions' / f'{edition}-small.webp', (THUMB_SIZE, THUMB_SIZE))
        logos[edition] = {'width': width, 'height': height, 'small': {'width': thumb_width, 'height': thumb_height}}
    written.sort()
    (ROOT / 'data' / 'role-art.json').write_text(json.dumps({'icons': written, 'logos': logos}, indent=1) + '\n', encoding='utf-8')
    proxy = ROOT / 'proxy.ts'
    text = proxy.read_text(encoding='utf-8')
    pattern = f"roles/(?:{'|'.join(written)})\\\\.webp$|roles/editions/(?:{'|'.join(sorted(LOGOS))})(?:-small)?\\\\.webp$"
    if not MATCHER.search(text):
        sys.exit('The roles part of the matcher was not found in proxy.ts: add it by hand once, then rerun.')
    proxy.write_text(MATCHER.sub(lambda _: pattern, text, count=1), encoding='utf-8')
    print(f'{len(written)} icons, {len(LOGOS)} logos written to {OUT.relative_to(ROOT)}; data/role-art.json and proxy.ts updated.')
    if missing:
        print('No icon for: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
