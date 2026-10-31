#!/usr/bin/env python3
"""Convertit les données OpenStreetMap de Niamey en tuiles binaires pour le jeu Godot.

Entrée  : references/osm/{routes,lieux,bat_*}.json (Overpass, « out geom »)
Sortie  : jeu/donnees/monde.json (métadonnées, lieux, quartiers)
          jeu/donnees/tuiles/t_<i>_<j>.bin (bâtiments, routes, arbres, relief par tuile)

Repère du jeu : X = est, Z = sud (Godot : -Z = nord), Y = haut, en mètres.
Origine : le Grand Marché de Niamey.

Format d'une tuile (petit-boutiste) :
  'NCT1' | u8 a_relief
  si a_relief : f32 hauteurs[(N+1)*(N+1)]  (grille de RELIEF_PAS m, ligne par ligne en z)
  u32 nb_batiments ; pour chacun : u8 type, f32 hauteur, u32 couleur RGBA, u16 n, n × (f32 x, f32 z)
  u32 nb_routes    ; pour chacune : u8 classe, u8 revetement, u8 pont, f32 largeur, u16 n, n × (f32 x, f32 z)
  u32 nb_arbres    ; pour chacun : u8 espece, f32 x, f32 z, f32 echelle
"""
import glob
import json
import math
import os
import random
import struct
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OSM = os.path.join(RACINE, 'references', 'osm')
SORTIE = os.path.join(RACINE, 'jeu', 'donnees')

LAT0, LON0 = 13.5168, 2.1177          # Grand Marché
MX = 111320.0 * math.cos(math.radians(LAT0))
MZ = 110574.0
TUILE = 256.0
RELIEF_PAS = 8.0
N = int(TUILE / RELIEF_PAS)           # 32 cases → 33 × 33 points
RASTER = 4.0                          # résolution des masques (m / pixel)
PROF_FLEUVE = 4.5                     # profondeur du lit du fleuve


def proj(lat, lon):
    return ((lon - LON0) * MX, -(lat - LAT0) * MZ)


def charger(nom):
    with open(os.path.join(OSM, nom), encoding='utf-8') as f:
        return json.load(f)['elements']


# ---------------------------------------------------------------- routes
CLASSES = {  # classe OSM -> (id, largeur, revêtement par défaut 0=goudron 1=latérite 2=sable)
    'motorway': (0, 20, 0), 'trunk': (0, 20, 0), 'trunk_link': (1, 9, 0), 'primary': (1, 16, 0), 'primary_link': (1, 9, 0),
    'secondary': (2, 12, 0), 'secondary_link': (2, 8, 0), 'tertiary': (3, 10, 0), 'tertiary_link': (3, 7, 0),
    'unclassified': (4, 8, 1), 'residential': (5, 7, 1), 'living_street': (5, 6, 1), 'service': (6, 5, 1),
    'track': (7, 4.5, 2), 'path': (8, 2.2, 2), 'footway': (8, 2.5, 2), 'pedestrian': (8, 6, 0), 'cycleway': (8, 2.5, 0),
}
REVET = {'asphalt': 0, 'paved': 0, 'concrete': 0, 'paving_stones': 0, 'concrete:plates': 0,
         'unpaved': 1, 'compacted': 1, 'gravel': 1, 'fine_gravel': 1, 'ground': 1, 'dirt': 1, 'earth': 1, 'sand': 2}

# ---------------------------------------------------------------- bâtiments
BANCO = [(0xC9, 0x8E, 0x5C), (0xB9, 0x7A, 0x4A), (0xD2, 0xA2, 0x72), (0xA8, 0x6B, 0x45), (0xC4, 0x93, 0x6A), (0xD8, 0xB0, 0x86)]
CIMENT = [(0xE6, 0xDD, 0xCF), (0xD9, 0xCF, 0xBF), (0xEF, 0xE8, 0xDC), (0xCF, 0xC4, 0xB2)]
PEINT = [(0xE8, 0xD2, 0xA8), (0xF0, 0xE0, 0xC0), (0xD8, 0xC0, 0x9A), (0xC8, 0xD8, 0xC8), (0xD0, 0xDC, 0xE8), (0xE8, 0xC8, 0xB0), (0xF2, 0xEE, 0xE6)]
TYPE_BAT = {'mosque': 2, 'school': 3, 'university': 3, 'hut': 4, 'construction': 5, 'retail': 6, 'commercial': 6, 'roof': 7}


def aire(poly):
    s = 0.0
    for i in range(len(poly)):
        x1, z1 = poly[i]; x2, z2 = poly[(i + 1) % len(poly)]
        s += x1 * z2 - x2 * z1
    return abs(s) / 2


def centre(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def dans(pt, poly):
    x, z = pt; ok = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            ok = not ok
        j = i
    return ok


# ---------------------------------------------------------------- multipolygones (fleuve)
def assembler_anneaux(chemins):
    """Relie des morceaux de lignes par leurs extrémités pour former des anneaux fermés."""
    reste = [list(c) for c in chemins if len(c) >= 2]
    anneaux = []
    while reste:
        a = reste.pop()
        change = True
        while change and a[0] != a[-1]:
            change = False
            for k, c in enumerate(reste):
                if c[0] == a[-1]: a += c[1:]
                elif c[-1] == a[-1]: a += c[::-1][1:]
                elif c[-1] == a[0]: a = c + a[1:]
                elif c[0] == a[0]: a = c[::-1] + a[1:]
                else: continue
                reste.pop(k); change = True; break
        if len(a) >= 4: anneaux.append(a)
    return anneaux


def main():
    random.seed(227)
    print('Lecture des données OSM…')
    routes_osm = charger('routes.json')
    lieux_osm = charger('lieux.json')
    bats_osm = []
    for f in sorted(glob.glob(os.path.join(OSM, 'bat_*.json'))):
        bats_osm += charger(os.path.basename(f))

    # étendue du monde
    xmin, zmax = proj(13.44, 2.03)
    xmax, zmin = proj(13.62, 2.21)
    i0, i1 = math.floor(xmin / TUILE), math.ceil(xmax / TUILE)
    j0, j1 = math.floor(zmin / TUILE), math.ceil(zmax / TUILE)
    W, H = int((i1 - i0) * TUILE / RASTER), int((j1 - j0) * TUILE / RASTER)
    ox, oz = i0 * TUILE, j0 * TUILE
    pix = lambda x, z: ((x - ox) / RASTER, (z - oz) / RASTER)

    # ---------- eau : masque raster, puis relief du lit adouci
    print('Fleuve et plans d\'eau…')
    eau = Image.new('L', (W, H), 0); de = ImageDraw.Draw(eau)
    for e in lieux_osm:
        t = e.get('tags', {})
        estEau = t.get('natural') == 'water' or t.get('waterway') == 'riverbank' or t.get('landuse') == 'reservoir'
        if not estEau: continue
        if e['type'] == 'way' and len(e.get('geometry', [])) >= 4:
            de.polygon([pix(*proj(p['lat'], p['lon'])) for p in e['geometry']], fill=255)
        elif e['type'] == 'relation':
            ext = [[(p['lat'], p['lon']) for p in m['geometry']] for m in e['members'] if m.get('role') == 'outer' and m.get('geometry')]
            inn = [[(p['lat'], p['lon']) for p in m['geometry']] for m in e['members'] if m.get('role') == 'inner' and m.get('geometry')]
            for a in assembler_anneaux(ext): de.polygon([pix(*proj(*p)) for p in a], fill=255)
            for a in assembler_anneaux(inn): de.polygon([pix(*proj(*p)) for p in a], fill=0)
    lit = np.asarray(eau.filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255.0
    masque_eau = np.asarray(eau) > 127

    # ---------- bâtiments
    print(f'{len(bats_osm)} bâtiments…')
    poi = []  # lieux de culte, écoles… pour typer les bâtiments
    for e in lieux_osm:
        t = e.get('tags', {})
        if e['type'] == 'node' and t.get('amenity') in ('place_of_worship', 'school', 'marketplace', 'fuel', 'hospital', 'police'):
            poi.append((proj(e['lat'], e['lon']), t.get('amenity'), t.get('religion')))
    poi_grille = {}
    for p in poi: poi_grille.setdefault((int(p[0][0] // 64), int(p[0][1] // 64)), []).append(p)

    tuiles = {}
    T = lambda i, j: tuiles.setdefault((i, j), {'bat': [], 'rt': [], 'arb': []})
    occupe = Image.new('L', (W, H), 0); do = ImageDraw.Draw(occupe)
    deja = set()
    for e in bats_osm:
        if e['id'] in deja or e['type'] != 'way' or len(e.get('geometry', [])) < 4: continue
        deja.add(e['id'])
        t = e.get('tags', {})
        poly = [proj(p['lat'], p['lon']) for p in e['geometry']][:-1]
        A = aire(poly)
        if A < 4 or A > 60000: continue
        cx, cz = centre(poly)
        typ = TYPE_BAT.get(t.get('building'), 0)
        for (p, am, rel) in poi_grille.get((int(cx // 64), int(cz // 64)), []):
            if dans(p, poly):
                typ = 2 if am == 'place_of_worship' and rel != 'christian' else 3 if am == 'school' else 6 if am in ('marketplace', 'fuel') else 1
        d = math.hypot(cx, cz)
        rnd = random.Random(e['id'])
        if 'building:levels' in t:
            try: niv = max(1, int(float(t['building:levels'])))
            except ValueError: niv = 1
        elif typ == 4 or A < 14: niv = 0
        elif A > 350 and d < 2500: niv = rnd.choice([1, 2, 2, 3, 3, 4])
        elif A > 150: niv = rnd.choice([1, 1, 2, 2, 3]) if d < 3000 else rnd.choice([1, 1, 1, 2])
        else: niv = 2 if rnd.random() < (0.22 if d < 3000 else 0.07) else 1
        h = 2.7 if niv == 0 else niv * 3.1 + 0.4 + rnd.uniform(-0.2, 0.3)
        if typ == 2: h = max(h, 6.5)
        # couleur : banco dans les quartiers, ciment / peinture au centre
        r = rnd.random()
        if typ == 4: col = rnd.choice(BANCO)
        elif d < 2200: col = rnd.choice(PEINT) if r < 0.55 else rnd.choice(CIMENT) if r < 0.85 else rnd.choice(BANCO)
        else: col = rnd.choice(BANCO) if r < 0.6 else rnd.choice(CIMENT) if r < 0.85 else rnd.choice(PEINT)
        couleur = (col[0] << 24) | (col[1] << 16) | (col[2] << 8) | 255
        T(int(cx // TUILE), int(cz // TUILE))['bat'].append((typ, h, couleur, poly))
        do.polygon([pix(*p) for p in poly], fill=255)

    # ---------- routes : découpées par tuile
    print('Routes…')
    nr = 0
    for e in routes_osm:
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in CLASSES or len(e.get('geometry', [])) < 2: continue
        cl, larg, rv = CLASSES[hw]
        rv = REVET.get(t.get('surface'), rv)
        if 'lanes' in t:
            try: larg = max(larg, float(t['lanes']) * 3.4)
            except ValueError: pass
        pont = 1 if t.get('bridge') in ('yes', 'viaduct') else 0
        pts = [proj(p['lat'], p['lon']) for p in e['geometry']]
        courant, cle = [pts[0]], None
        for a, b in zip(pts, pts[1:]):
            k = (int(((a[0] + b[0]) / 2) // TUILE), int(((a[1] + b[1]) / 2) // TUILE))
            if cle is not None and k != cle:
                T(*cle)['rt'].append((cl, rv, pont, larg, courant)); courant = [a]
            cle = k; courant.append(b)
        T(*cle)['rt'].append((cl, rv, pont, larg, courant)); nr += 1
        if cl <= 7:
            do.line([pix(*p) for p in pts], fill=255, width=max(1, int((larg + 3) / RASTER)))
    print(f'  {nr} routes')

    # ---------- arbres : neems dans les cours et le long des grands axes, épineux en brousse
    print('Arbres…')
    occ = np.asarray(occupe) > 0
    zones_vertes = Image.new('L', (W, H), 0); dz = ImageDraw.Draw(zones_vertes)
    for e in lieux_osm:
        t = e.get('tags', {})
        if e['type'] == 'way' and (t.get('landuse') in ('grass', 'forest', 'orchard', 'farmland', 'meadow') or t.get('leisure') in ('park', 'garden') or t.get('natural') in ('wood', 'scrub', 'wetland')):
            if len(e.get('geometry', [])) >= 4: dz.polygon([pix(*proj(p['lat'], p['lon'])) for p in e['geometry']], fill=255)
    vert = np.asarray(zones_vertes) > 0
    # densité de bâti locale (cases de 64 m) pour savoir si on est en ville
    dens = np.asarray(occupe.resize((W // 16, H // 16), Image.BOX), dtype=np.float32) / 255.0
    na = 0
    for (i, j), tu in list(tuiles.items()):
        rnd = random.Random(i * 7919 + j)
        for _ in range(160):
            x, z = (i + rnd.random()) * TUILE, (j + rnd.random()) * TUILE
            px, pz = int((x - ox) / RASTER), int((z - oz) / RASTER)
            if not (0 <= px < W and 0 <= pz < H) or occ[pz, px] or masque_eau[pz, px] or lit[pz, px] > 0.05: continue
            db = dens[min(pz // 16, dens.shape[0] - 1), min(px // 16, dens.shape[1] - 1)]
            p = 0.65 if vert[pz, px] else (0.5 if db > 0.12 else 0.12)
            if rnd.random() > p: continue
            esp = 0 if db > 0.08 or vert[pz, px] else (1 if rnd.random() < 0.8 else 2)  # 0 neem, 1 acacia, 2 baobab
            if rnd.random() < 0.06 and db > 0.05: esp = 3                                # palmier / rônier
            tu['arb'].append((esp, x, z, rnd.uniform(0.8, 1.25))); na += 1
    # arbres d'alignement (neems) le long des grands axes, comme sur les boulevards de Niamey
    for e in routes_osm:
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in CLASSES or CLASSES[hw][0] > 3 or t.get('bridge') or len(e.get('geometry', [])) < 2: continue
        larg = CLASSES[hw][1]
        pts = [proj(p['lat'], p['lon']) for p in e['geometry']]
        rnd = random.Random(e['id'])
        reste = rnd.uniform(0, 14)
        for a_, b_ in zip(pts, pts[1:]):
            L = math.dist(a_, b_)
            if L < 1: continue
            dx, dz = (b_[0] - a_[0]) / L, (b_[1] - a_[1]) / L
            d = reste
            while d < L:
                for cote in (-1, 1):
                    if rnd.random() > 0.62: continue
                    o = larg / 2 + 3.4 + rnd.uniform(0, 1.2)
                    x, z = a_[0] + dx * d - dz * o * cote, a_[1] + dz * d + dx * o * cote
                    px, pz = int((x - ox) / RASTER), int((z - oz) / RASTER)
                    if not (0 <= px < W and 0 <= pz < H) or occ[pz, px] or masque_eau[pz, px]: continue
                    T(int(x // TUILE), int(z // TUILE))['arb'].append((0, x, z, rnd.uniform(0.85, 1.2))); na += 1
                d += 14
            reste = d - L
    print(f'  {na} arbres')

    # ---------- aperçu (contrôle visuel)
    ap = np.zeros((H, W, 3), np.uint8); ap[:] = (205, 170, 120)
    ap[vert] = (150, 170, 90); ap[occ] = (120, 80, 50); ap[masque_eau] = (60, 110, 160)
    Image.fromarray(ap).resize((W // 4, H // 4), Image.BOX).save(os.path.join(RACINE, 'outils', 'apercu_carte.png'))
    # mini-carte du jeu : 4 m par pixel, routes dessinées en clair par-dessus
    carte = Image.fromarray(ap)
    dc = ImageDraw.Draw(carte)
    for e in routes_osm:
        t = e.get('tags', {})
        if t.get('highway') in CLASSES and len(e.get('geometry', [])) >= 2:
            cl, larg, _ = CLASSES[t['highway']]
            if cl <= 6:
                dc.line([pix(*proj(p['lat'], p['lon'])) for p in e['geometry']], fill=(235, 228, 210) if cl <= 3 else (196, 150, 110), width=max(1, int(larg / RASTER)))
    carte = carte.resize((W // 2, H // 2), Image.LANCZOS)
    carte.save(os.path.join(SORTIE, 'carte.png'), optimize=True)

    # ---------- écriture des tuiles
    os.makedirs(os.path.join(SORTIE, 'tuiles'), exist_ok=True)
    for f in glob.glob(os.path.join(SORTIE, 'tuiles', '*.bin')): os.remove(f)
    taille = 0
    for i in range(i0, i1):
        for j in range(j0, j1):
            tu = tuiles.get((i, j), {'bat': [], 'rt': [], 'arb': []})
            b = bytearray(b'NCT1')
            # relief : seulement si le lit du fleuve touche la tuile
            hs = []
            for gz in range(N + 1):
                for gx in range(N + 1):
                    x, z = i * TUILE + gx * RELIEF_PAS, j * TUILE + gz * RELIEF_PAS
                    px, pz = min(W - 1, max(0, int((x - ox) / RASTER))), min(H - 1, max(0, int((z - oz) / RASTER)))
                    v = float(lit[pz, px])
                    hs.append(-PROF_FLEUVE * min(1.0, v * 1.6) if v > 0.01 else 0.0)
            a_relief = any(h < -0.01 for h in hs)
            b += struct.pack('<B', 1 if a_relief else 0)
            if a_relief: b += struct.pack(f'<{len(hs)}f', *hs)
            b += struct.pack('<I', len(tu['bat']))
            for typ, h, coul, poly in tu['bat']:
                b += struct.pack('<BfIH', typ, h, coul, len(poly))
                b += struct.pack(f'<{2 * len(poly)}f', *[c for p in poly for c in p])
            b += struct.pack('<I', len(tu['rt']))
            for cl, rv, pont, larg, pts in tu['rt']:
                b += struct.pack('<BBBfH', cl, rv, pont, larg, len(pts))
                b += struct.pack(f'<{2 * len(pts)}f', *[c for p in pts for c in p])
            b += struct.pack('<I', len(tu['arb']))
            for esp, x, z, s in tu['arb']:
                b += struct.pack('<Bfff', esp, x, z, s)
            if not a_relief and not tu['bat'] and not tu['rt'] and not tu['arb']: continue
            with open(os.path.join(SORTIE, 'tuiles', f't_{i}_{j}.bin'), 'wb') as f:
                data = zlib.compress(bytes(b), 6)
                f.write(struct.pack('<I', len(b)) + data); taille += len(data) + 4

    # ---------- métadonnées : lieux et quartiers
    lieux, quartiers = [], []
    for e in lieux_osm:
        t = e.get('tags', {})
        if 'lat' in e: la, lo = e['lat'], e['lon']
        elif 'bounds' in e: la, lo = (e['bounds']['minlat'] + e['bounds']['maxlat']) / 2, (e['bounds']['minlon'] + e['bounds']['maxlon']) / 2
        else: continue
        x, z = proj(la, lo)
        if t.get('place') in ('suburb', 'neighbourhood', 'quarter') and t.get('name'):
            quartiers.append({'nom': t['name'], 'x': round(x, 1), 'z': round(z, 1)})
        elif t.get('name') and (t.get('amenity') in ('place_of_worship', 'marketplace', 'hospital', 'police', 'townhall', 'university', 'fuel', 'bus_station')
                                or t.get('tourism') in ('museum', 'hotel', 'attraction')):
            lieux.append({'nom': t['name'], 'type': t.get('amenity') or t.get('tourism'), 'x': round(x, 1), 'z': round(z, 1)})
    # point de départ : bord du grand axe goudronné le plus proche du Grand Marché, voitures garées le long
    best = None
    for e in routes_osm:
        t = e.get('tags', {})
        if t.get('highway') not in ('primary', 'secondary', 'trunk') or t.get('bridge') or len(e.get('geometry', [])) < 2: continue
        pts = [proj(p['lat'], p['lon']) for p in e['geometry']]
        for a_, b_ in zip(pts, pts[1:]):
            L = math.dist(a_, b_)
            if L < 40: continue
            mx, mz = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
            d = math.hypot(mx - 250, mz - 250)  # un peu au sud-est du marché, hors de la zone la plus dense
            if best is None or d < best[0]: best = (d, a_, b_, CLASSES[t['highway']][1])
    _, a_, b_, larg = best
    dx, dz = b_[0] - a_[0], b_[1] - a_[1]; L = math.hypot(dx, dz); dx, dz = dx / L, dz / L
    px, pz = -dz, dx
    mx, mz = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
    cap = math.atan2(dx, dz)
    off_trot, off_voie = larg / 2 + 2.0, larg / 2 - 1.6
    apparition = {'x': round(mx + px * (larg / 2 - 0.7) - dx * 30, 2), 'z': round(mz + pz * (larg / 2 - 0.7) - dz * 30, 2), 'cap': round(cap, 4),
                  'places': [{'x': round(mx + px * off_voie + dx * k, 2), 'z': round(mz + pz * off_voie + dz * k, 2), 'cap': round(cap, 4)} for k in (-14, -6, 6, 14)]}

    meta = {
        'version': 1, 'source': '© contributeurs OpenStreetMap (ODbL)', 'origine': {'lat': LAT0, 'lon': LON0},
        'tuile': TUILE, 'relief_pas': RELIEF_PAS, 'tuiles': {'i0': i0, 'i1': i1, 'j0': j0, 'j1': j1},
        'apparition': apparition,
        'carte': {'fichier': 'carte.png', 'm_par_px': RASTER * 2, 'x0': ox, 'z0': oz}, 'quartiers': quartiers, 'lieux': lieux,
    }
    with open(os.path.join(SORTIE, 'monde.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f'Terminé : {len(glob.glob(os.path.join(SORTIE, "tuiles", "*.bin")))} tuiles, {taille / 1e6:.1f} Mo, '
          f'{len(quartiers)} quartiers, {len(lieux)} lieux')


if __name__ == '__main__':
    sys.exit(main())
