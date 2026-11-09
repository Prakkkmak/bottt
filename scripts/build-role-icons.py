"""
Builds public/roles/: one small WebP icon per character of data/characters.json, and the logos of the base scripts and
the Carousel, from a clone of the French wiki's repository (https://github.com/BambiPotato/botc-fr-bambi), which holds
the official icons in images/Icon_<name>.png.

    git clone --depth 1 https://github.com/BambiPotato/botc-fr-bambi /tmp/botc-fr-bambi
    python3 -I scripts/build-role-icons.py /tmp/botc-fr-bambi

Needs Pillow. The icons and logos belong to The Pandemonium Institute (see the README): rerun it when roles are added to
data/characters.json, and read the list of missing icons it prints.
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
# The logos the pages show, by edition (lib/characters.ts), with the file that holds each in the wiki's images.
LOGOS = {'tb': 'Logo_trouble_brewing.png', 'bmr': 'Logo_bad_moon_rising-1.png', 'snv': 'Logo_sects_and_violets.png', 'carousel': 'carousel.png'}


def character_id(value: str) -> str:
    """As lib/scripts.ts characterId: lower case letters and digits only."""
    plain = unicodedata.normalize('NFD', value)
    plain = ''.join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', plain.lower())


def save(source: Path, target: Path, size: tuple[int, int]) -> None:
    image = Image.open(source).convert('RGBA')
    # Trim the transparent margin, so that every icon fills its box the same way.
    box = image.getchannel('A').getbbox()
    if box:
        image = image.crop(box)
    image.thumbnail(size, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, 'WEBP', quality=82, method=6)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 -I scripts/build-role-icons.py <clone of botc-fr-bambi>')
    images = Path(sys.argv[1]) / 'images'
    characters = json.loads((ROOT / 'data' / 'characters.json').read_text(encoding='utf-8'))['characters']
    # Icon_drunk-1.png is the Drunk's icon when no Icon_drunk.png exists: an unsuffixed file wins.
    icons: dict[str, Path] = {}
    for path in sorted(images.glob('Icon_*.png'), key=lambda p: (p.stem.endswith('-1'), p.name)):
        key = character_id(re.sub(r'-1$', '', path.stem[len('Icon_'):]))
        icons.setdefault(key, path)
    missing = []
    for character in characters:
        source = icons.get(character['id'])
        if source is None:
            missing.append(character['id'])
            continue
        save(source, OUT / f"{character['id']}.webp", (ICON_SIZE, ICON_SIZE))
    for edition, name in LOGOS.items():
        save(images / name, OUT / 'editions' / f'{edition}.webp', (LOGO_WIDTH, LOGO_WIDTH))
    print(f'{len(characters) - len(missing)} icons, {len(LOGOS)} logos written to {OUT.relative_to(ROOT)}.')
    if missing:
        print('No icon for: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
