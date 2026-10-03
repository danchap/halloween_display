#!/usr/bin/env python3
"""Fetch the Impasse du Rossignol site data from IGN's open services.

Writes site.json (buildings, roads, alley axis in local meters) and
ortho.jpg (orthophoto of the area) next to this script. Standard library
only. Run it again to refresh the data; the visualizer reads the files, not
the network, so it works offline once they exist.

Sources (all open data, Licence Ouverte / Etalab 2.0):
  BD TOPO v3 buildings and roads  https://data.geopf.fr/wfs/ows
  BD ORTHO orthophoto             https://data.geopf.fr/wms-r
  RGE ALTI ground elevation       https://data.geopf.fr/altimetrie
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The brief's reference point, IGN Lambert-93 (EPSG:2154), meters.
ORIGIN_E, ORIGIN_N = 353752.51, 6582086.15
RADIUS = 65          # meters of context around the point
ORTHO_HALF = 60      # orthophoto half-width, meters
ORTHO_PX = 2400      # 120 m at 5 cm per pixel

WFS = "https://data.geopf.fr/wfs/ows"
WMS = "https://data.geopf.fr/wms-r"
ALTI = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"


def lambert93_to_wgs84(x, y):
    """Inverse Lambert-93 (GRS80), IGN constants."""
    n = 0.7256077650532670
    c = 11754255.426096
    xs, ys = 700000.0, 12655612.049876
    e = 0.0818191910428158
    r = math.hypot(x - xs, ys - y)
    gamma = math.atan((x - xs) / (ys - y))
    lon = 3.0 + math.degrees(gamma / n)
    liso = -math.log(r / c) / n
    phi = 2 * math.atan(math.exp(liso)) - math.pi / 2
    for _ in range(20):
        es = e * math.sin(phi)
        phi = 2 * math.atan(((1 + es) / (1 - es)) ** (e / 2) * math.exp(liso)) - math.pi / 2
    return math.degrees(phi), lon


def get(url, params=None, timeout=90):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "halloween-display-visualizer/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def wfs(typename, bbox):
    data = get(WFS, {
        "SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
        "TYPENAMES": typename, "SRSNAME": "EPSG:2154",
        "BBOX": "%f,%f,%f,%f,EPSG:2154" % bbox,
        "OUTPUTFORMAT": "application/json",
    })
    return json.loads(data)["features"]


def local(x, y):
    """Lambert-93 to local east/north meters, rounded to the centimeter."""
    return [round(x - ORIGIN_E, 2), round(y - ORIGIN_N, 2)]


def rings_of(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        rings = [[local(p[0], p[1]) for p in ring] for ring in poly]
        out.append({"outer": rings[0], "holes": rings[1:]})
    return out


def main():
    bbox = (ORIGIN_E - RADIUS, ORIGIN_N - RADIUS, ORIGIN_E + RADIUS, ORIGIN_N + RADIUS)
    lat, lon = lambert93_to_wgs84(ORIGIN_E, ORIGIN_N)
    print("origin WGS84: %.6f, %.6f" % (lat, lon))

    print("buildings ...", end=" ", flush=True)
    buildings = []
    for f in wfs("BDTOPO_V3:batiment", bbox):
        p = f["properties"]
        eave = p.get("hauteur")
        roof_min, roof_max = p.get("altitude_minimale_toit"), p.get("altitude_maximale_toit")
        ridge = None
        if roof_min is not None and roof_max is not None and roof_max > roof_min:
            ridge = round(roof_max - roof_min, 2)
        buildings.append({
            "id": p["cleabs"],
            "usage": p.get("usage_1"),
            "floors": p.get("nombre_d_etages"),
            "eaveHeight": eave,          # ground to the bottom of the roof, m
            "ridgeAbove": ridge,         # eave to ridge, m, when IGN has it
            "groundAlt": p.get("altitude_minimale_sol"),
            "light": bool(p.get("construction_legere")),
            "polygons": rings_of(f["geometry"]),
        })
    print(len(buildings))

    print("roads ...", end=" ", flush=True)
    roads = []
    for f in wfs("BDTOPO_V3:troncon_de_route", bbox):
        p = f["properties"]
        roads.append({
            "name": p.get("nom_voie_ban_gauche") or p.get("nom_voie_ban_droite"),
            "nature": p.get("nature"),
            "width": p.get("largeur_de_chaussee"),
            "points": [local(c[0], c[1]) for c in f["geometry"]["coordinates"]],
        })
    print(len(roads))

    # The alley axis: the road centerline named Impasse du Rossignol, from
    # its junction with the street to its dead end.
    alley = next(r for r in roads if r["name"] == "Impasse du Rossignol")
    pts = alley["points"]
    street = next(r for r in roads if r["name"] == "Rue de Trousse Chemise"
                  and any(math.dist(q, pts[0]) < 0.01 or math.dist(q, pts[-1]) < 0.01 for q in r["points"]))
    start, end = (pts[0], pts[-1]) if any(math.dist(q, pts[0]) < 0.01 for q in street["points"]) else (pts[-1], pts[0])
    de, dn = end[0] - start[0], end[1] - start[1]
    length = math.hypot(de, dn)
    print("alley: from %s to %s, %.1f m long, bearing %.1f deg" % (start, end, length, (math.degrees(math.atan2(de, dn)) % 360)))

    print("elevation ...", end=" ", flush=True)
    elev = None
    try:
        elev = json.loads(get(ALTI, {"lon": "%.6f" % lon, "lat": "%.6f" % lat,
                                     "resource": "ign_rge_alti_wld", "zonly": "true"}))["elevations"][0]
    except Exception as exc:  # the elevation is informative only
        print("failed:", exc, end=" ")
    print(elev)

    print("orthophoto ...", end=" ", flush=True)
    obbox = (ORIGIN_E - ORTHO_HALF, ORIGIN_N - ORTHO_HALF, ORIGIN_E + ORTHO_HALF, ORIGIN_N + ORTHO_HALF)
    img = get(WMS, {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
        "LAYERS": "ORTHOIMAGERY.ORTHOPHOTOS", "STYLES": "", "CRS": "EPSG:2154",
        "BBOX": "%f,%f,%f,%f" % obbox, "WIDTH": ORTHO_PX, "HEIGHT": ORTHO_PX,
        "FORMAT": "image/jpeg",
    }, timeout=120)
    if not img.startswith(b"\xff\xd8"):
        sys.exit("orthophoto request did not return a JPEG: %r" % img[:200])
    (HERE / "ortho.jpg").write_bytes(img)
    print("%d bytes" % len(img))

    site = {
        "origin": {"lambert93": [ORIGIN_E, ORIGIN_N], "wgs84": [round(lat, 6), round(lon, 6)],
                   "groundElevation": elev},
        "address": "Impasse du Rossignol, off 1 Rue de Trousse Chemise, 17880 Les Portes-en-Re, France",
        "alley": {"name": alley["name"], "start": start, "end": end, "length": round(length, 2),
                  "roadWidth": alley["width"]},
        "ortho": {"file": "ortho.jpg", "halfWidth": ORTHO_HALF, "pixels": ORTHO_PX},
        "buildings": buildings,
        "roads": roads,
        "sources": [
            "IGN BD TOPO v3 (batiment, troncon_de_route) via data.geopf.fr WFS",
            "IGN BD ORTHO via data.geopf.fr WMS",
            "IGN RGE ALTI via data.geopf.fr altimetrie",
        ],
    }
    (HERE / "site.json").write_text(json.dumps(site, separators=(",", ":"), ensure_ascii=False))
    print("wrote site.json and ortho.jpg")


if __name__ == "__main__":
    main()
