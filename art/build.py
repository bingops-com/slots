#!/usr/bin/env python3
"""Prépare les illustrations générées (art/<jeu>/src/*.png) pour l'interface :
détourage des marges, mise au carré, réduction et conversion en WebP dans
web/public/art/<jeu>/. À relancer après avoir remplacé une image source.

    python3 art/build.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "web" / "public" / "art"

# Taille finale (côté, en pixels) des images détourées ; les symboles par défaut.
SIZES = {"hero": 560, "cannon": 400, "hook": 320, "dynamite": 400, "dealer": 520, "crab": 480, "wheel": 720, "dice": 360, "submarine": 420, "duellist-a": 420, "duellist-b": 420, "orb": 288}
SYMBOL = 288
# Décors : largeur finale.
STAGES = {"stage": 1600, "stage-bonus": 1600}


def cutout(src, size: int) -> Image.Image:
    im = src if isinstance(src, Image.Image) else Image.open(src).convert("RGBA")
    # Les pixels presque transparents laissés par le générateur ne comptent pas dans la marge.
    box = im.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    im = im.crop(box)
    side = max(im.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return square.resize((size, size), Image.LANCZOS)


# Les planches : neuf symboles générés d'un coup sur une même image, pour qu'ils soient de
# la même main. Chaque case est découpée, son fond bleu retiré, puis traitée comme un
# symbole ordinaire.
SHEETS = {
    "neptune": ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"],
    "reef": ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"],
    "dogs": ["dog4", "dog3", "dog2", "dog1", "collar", "bone", "wild", "scatter", "bowl"],
}


def sheet(game: Path, names: list[str], dest: Path) -> None:
    from PIL import ImageDraw

    src = game / "src" / "sheet.png"
    if not src.exists():
        return
    im = Image.open(src).convert("RGBA")
    side = im.width // 3
    for i, name in enumerate(names):
        cell = im.crop(((i % 3) * side, (i // 3) * side, (i % 3 + 1) * side, (i // 3 + 1) * side))
        # Le fond se retire depuis les bords : le bleu marine qui fait partie du dessin reste.
        for k in range(0, side, 24):
            for xy in ((k, 0), (k, side - 1), (0, k), (side - 1, k)):
                if cell.getpixel(xy)[3]:
                    ImageDraw.floodfill(cell, xy, (0, 0, 0, 0), thresh=14)
        cutout(cell, SYMBOL).save(dest / f"{name}.webp", quality=90, method=6)
    print(f"{game.name}/  planche de {len(names)} symboles")


def brand() -> None:
    """Le logo : une tuile bleue aux coins arrondis, déclinée pour la barre de navigation,
    l'onglet du navigateur et l'écran d'accueil d'un téléphone."""
    from PIL import ImageDraw

    src = ROOT / "brand" / "src" / "logo.png"
    if not src.exists():
        return
    im = Image.open(src).convert("RGBA")
    inset = round(im.width * 0.012)  # le générateur laisse un liseré clair au bord
    im = im.crop((inset, inset, im.width - inset, im.height - inset))
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=round(im.width * 0.2), fill=255)
    im.putalpha(mask)
    web = ROOT.parent / "web"
    (web / "public" / "brand").mkdir(parents=True, exist_ok=True)
    for path, size in [
        (web / "public" / "brand" / "logo.webp", 160),
        (web / "public" / "brand" / "icon-192.png", 192),
        (web / "public" / "brand" / "icon-512.png", 512),
        (web / "app" / "icon.png", 96),
        (web / "app" / "apple-icon.png", 180),
    ]:
        im.resize((size, size), Image.LANCZOS).save(path)
        print(f"{path.relative_to(web)}  {path.stat().st_size // 1024} Ko")


def covers() -> None:
    """Les affiches de la page d'accueil : une scène par jeu, avec son personnage ou son
    objet en pleine action (reference.webp d'une machine, tables/reference pour une table)."""
    dest = OUT / "home"
    dest.mkdir(parents=True, exist_ok=True)
    tables = ROOT / "tables" / "reference"
    sources = {name: ROOT / name / "reference.webp" for name in ["beard", "bass", "bounty", "neptune", "reef", "dogs"]}
    sources |= {name: tables / f"{name}.webp" for name in ["blackjack", "roulette", "dice", "mines", "crash", "plinko", "holdem"]}
    for name, src in sources.items():
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB")
        im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS).save(dest / f"{name}.webp", quality=80, method=6)
    hero = ROOT / "beard" / "reference.webp"
    if hero.exists():
        im = Image.open(hero).convert("RGB")
        im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS).save(dest / "hero.webp", quality=82, method=6)
    print(f"home/  {len(list(dest.glob('*.webp')))} affiches")


brand()
covers()
for game in sorted(p for p in ROOT.iterdir() if (p / "src").is_dir() and p.name != "brand"):
    dest = OUT / game.name
    dest.mkdir(parents=True, exist_ok=True)
    sheet(game, SHEETS.get(game.name, []), dest)
    for src in sorted((game / "src").glob("*.png")):
        name = src.stem
        if name == "sheet":
            continue
        if name in STAGES or name.endswith("-stage"):
            width = STAGES.get(name, 1600)
            im = Image.open(src).convert("RGB")
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            im.save(dest / f"{name}.webp", quality=84, method=6)
        elif name == "card-back":
            # Le dos des cartes est une image pleine, pas un détourage.
            Image.open(src).convert("RGB").resize((300, 450), Image.LANCZOS).save(dest / f"{name}.webp", quality=88, method=6)
        else:
            cutout(src, SIZES.get(name, SYMBOL)).save(dest / f"{name}.webp", quality=90, method=6)
        print(f"{game.name}/{name}.webp  {(dest / f'{name}.webp').stat().st_size // 1024} Ko")
