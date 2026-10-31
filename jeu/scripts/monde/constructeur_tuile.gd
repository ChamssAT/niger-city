class_name ConstructeurTuile
extends RefCounted
## Lit une tuile binaire (outils/osm_vers_jeu.py) et calcule toute sa géométrie.
## Ne crée aucun nœud : s'exécute dans un thread de travail, le résultat est assemblé sur le thread principal.

const PROF_EAU := -1.4
const PAS := 8.0
const N := 32

var i: int
var j: int
var tuile: float
# résultat
var relief := PackedFloat32Array()
var surfaces := {}        # nom -> {v, n, c, uv}
var collisions := PackedVector3Array()
var arbres := {}          # espèce -> Array[Transform3D]
var poteaux: Array[Transform3D] = []
var lampadaires: Array[Transform3D] = []
var a_eau := false
var voies: Array = []     # [PackedVector2Array, largeur, classe, pont] pour piétons et circulation
var ok := false


func _init(ti: int, tj: int, taille: float) -> void:
	i = ti
	j = tj
	tuile = taille


func construire() -> void:
	var chemin := "res://donnees/tuiles/t_%d_%d.bin" % [i, j]
	if not FileAccess.file_exists(chemin):
		_sol_plat()
		ok = true
		return
	var brut := FileAccess.get_file_as_bytes(chemin)
	var d := brut.slice(4).decompress(brut.decode_u32(0), FileAccess.COMPRESSION_DEFLATE)
	if d.size() < 5 or d.slice(0, 4).get_string_from_ascii() != "NCT1":
		push_error("Tuile illisible : " + chemin)
		return
	var o := 4
	if d.decode_u8(o) == 1:
		relief = d.slice(o + 1, o + 1 + (N + 1) * (N + 1) * 4).to_float32_array()
		o += 1 + (N + 1) * (N + 1) * 4
	else:
		o += 1
	_sol()
	# bâtiments
	var nb := d.decode_u32(o); o += 4
	for _k in nb:
		var typ := d.decode_u8(o)
		var h := d.decode_float(o + 1)
		var coul := d.decode_u32(o + 5)
		var n := d.decode_u16(o + 9); o += 11
		var pts := d.slice(o, o + n * 8).to_float32_array(); o += n * 8
		_batiment(typ, h, Color.hex(coul), pts)
	# routes
	var nr := d.decode_u32(o); o += 4
	for _k in nr:
		var cl := d.decode_u8(o)
		var rv := d.decode_u8(o + 1)
		var pont := d.decode_u8(o + 2) == 1
		var larg := d.decode_float(o + 3)
		var n := d.decode_u16(o + 7); o += 9
		var pts := d.slice(o, o + n * 8).to_float32_array(); o += n * 8
		_route(cl, rv, pont, larg, pts)
	# arbres
	var na := d.decode_u32(o); o += 4
	for _k in na:
		var esp := d.decode_u8(o)
		var x := d.decode_float(o + 1)
		var z := d.decode_float(o + 5)
		var s := d.decode_float(o + 9); o += 13
		var b := Basis(Vector3.UP, fposmod(x * 13.7 + z * 7.1, TAU)).scaled(Vector3.ONE * s)
		if not arbres.has(esp): arbres[esp] = []
		arbres[esp].append(Transform3D(b, Vector3(x, hauteur(x, z) - 0.1, z)))
	ok = true


# ------------------------------------------------------------------ relief
func hauteur(x: float, z: float) -> float:
	if relief.is_empty(): return 0.0
	var gx := clampf((x - i * tuile) / PAS, 0.0, N - 0.001)
	var gz := clampf((z - j * tuile) / PAS, 0.0, N - 0.001)
	var ix := int(gx)
	var iz := int(gz)
	var fx := gx - ix
	var fz := gz - iz
	var a := relief[iz * (N + 1) + ix]
	var b := relief[iz * (N + 1) + ix + 1]
	var c := relief[(iz + 1) * (N + 1) + ix]
	var e := relief[(iz + 1) * (N + 1) + ix + 1]
	return lerpf(lerpf(a, b, fx), lerpf(c, e, fx), fz)


func _surf(nom: String) -> Dictionary:
	if not surfaces.has(nom):
		surfaces[nom] = {"v": PackedVector3Array(), "n": PackedVector3Array(), "c": PackedColorArray(), "uv": PackedVector2Array()}
	return surfaces[nom]


func _tri(s: Dictionary, a: Vector3, b: Vector3, c: Vector3, n: Vector3, col: Color, ua := Vector2.ZERO, ub := Vector2.ZERO, uc := Vector2.ZERO) -> void:
	s.v.append_array([a, b, c])
	s.n.append_array([n, n, n])
	s.c.append_array([col, col, col])
	s.uv.append_array([ua, ub, uc])


func _sol_plat() -> void:
	var s := _surf("sol")
	var x0 := i * tuile
	var z0 := j * tuile
	var a := Vector3(x0, 0, z0)
	var b := Vector3(x0 + tuile, 0, z0)
	var c := Vector3(x0 + tuile, 0, z0 + tuile)
	var e := Vector3(x0, 0, z0 + tuile)
	_tri(s, a, b, c, Vector3.UP, Color.WHITE)
	_tri(s, a, c, e, Vector3.UP, Color.WHITE)


func _sol() -> void:
	if relief.is_empty():
		_sol_plat()
		return
	var s := _surf("sol")
	var x0 := i * tuile
	var z0 := j * tuile
	var p := func(gx: int, gz: int) -> Vector3:
		return Vector3(x0 + gx * PAS, relief[gz * (N + 1) + gx], z0 + gz * PAS)
	for gz in N:
		for gx in N:
			var a: Vector3 = p.call(gx, gz)
			var b: Vector3 = p.call(gx + 1, gz)
			var c: Vector3 = p.call(gx + 1, gz + 1)
			var e: Vector3 = p.call(gx, gz + 1)
			var n1 := (c - a).cross(b - a).normalized()
			var n2 := (e - a).cross(c - a).normalized()
			# couleur.r = humidité de la berge (sable mouillé près de l'eau)
			var hum := Color(clampf(-minf(a.y, c.y) / 2.0, 0.0, 1.0), 0, 0)
			_tri(s, a, b, c, n1, hum)
			_tri(s, a, c, e, n2, hum)
			collisions.append_array([a, b, c, a, c, e])
			if minf(minf(a.y, b.y), minf(c.y, e.y)) < PROF_EAU: a_eau = true


# ------------------------------------------------------------------ bâtiments
func _batiment(typ: int, h: float, col: Color, pts: PackedFloat32Array) -> void:
	var n := pts.size() / 2
	if n < 3: return
	var poly := PackedVector2Array()
	var aire := 0.0
	for k in n:
		poly.append(Vector2(pts[k * 2], pts[k * 2 + 1]))
	for k in n:
		var a := poly[k]
		var b := poly[(k + 1) % n]
		aire += a.x * b.y - b.x * a.y
	var sens := 1.0 if aire > 0.0 else -1.0
	var sol := INF
	for p in poly: sol = minf(sol, hauteur(p.x, p.y))
	if sol < PROF_EAU + 0.3: return  # pas de maison dans le fleuve
	var y0 := sol - 0.4
	var y1 := sol + h
	var s := _surf("bati")
	var bas := col.darkened(0.25)
	var u := 0.0
	var acrotere := 0.45 if typ != 4 else 0.0
	for k in n:
		var a := poly[k]
		var b := poly[(k + 1) % n]
		var d := b - a
		var L := d.length()
		if L < 0.05: continue
		var nn := Vector3(d.y, 0, -d.x).normalized() * sens
		var a0 := Vector3(a.x, y0, a.y)
		var b0 := Vector3(b.x, y0, b.y)
		var a1 := Vector3(a.x, y1 + acrotere, a.y)
		var b1 := Vector3(b.x, y1 + acrotere, b.y)
		var hu := y1 + acrotere - y0
		# uv.x = abscisse le long de la façade, uv.y = hauteur ; couleur.a = 1 pour les murs
		s.v.append_array([a0, b0, b1, a0, b1, a1])
		s.n.append_array([nn, nn, nn, nn, nn, nn])
		var cb := Color(bas, 1.0)
		var ch := Color(col, 1.0)
		s.c.append_array([cb, cb, ch, cb, ch, ch])
		s.uv.append_array([Vector2(u, 0), Vector2(u + L, 0), Vector2(u + L, hu), Vector2(u, 0), Vector2(u + L, hu), Vector2(u, hu)])
		collisions.append_array([a0, b0, b1, a0, b1, a1])
		u += L
	# toit (couleur.a = 0 : pas de fenêtres dans le shader)
	if typ == 4:
		_toit_paille(poly, y1)
	else:
		var idx := Geometry2D.triangulate_polygon(poly)
		var cr := Color(col.darkened(0.12), 0.0)
		for t in range(0, idx.size(), 3):
			var p1 := poly[idx[t]]
			var p2 := poly[idx[t + 1]]
			var p3 := poly[idx[t + 2]]
			_tri(s, Vector3(p1.x, y1, p1.y), Vector3(p2.x, y1, p2.y), Vector3(p3.x, y1, p3.y), Vector3.UP, cr)
	if typ == 2: _minaret(poly, y1, sens)


func _toit_paille(poly: PackedVector2Array, y: float) -> void:
	var c := Vector2.ZERO
	for p in poly: c += p
	c /= poly.size()
	var s := _surf("paille")
	var sommet := Vector3(c.x, y + 2.2, c.y)
	for k in poly.size():
		var a := poly[k] + (poly[k] - c).normalized() * 0.6
		var b := poly[(k + 1) % poly.size()] + (poly[(k + 1) % poly.size()] - c).normalized() * 0.6
		var A := Vector3(a.x, y - 0.2, a.y)
		var B := Vector3(b.x, y - 0.2, b.y)
		var nn := (B - A).cross(sommet - A).normalized()
		if nn.y < 0: nn = -nn
		_tri(_surf("paille"), A, B, sommet, nn, Color.WHITE, Vector2(0, 0), Vector2(1, 0), Vector2(0.5, 1))


func _minaret(poly: PackedVector2Array, y: float, _sens: float) -> void:
	var c := Vector2.ZERO
	for p in poly: c += p
	c /= poly.size()
	var base := poly[0].lerp(c, 0.25)
	var s := _surf("bati")
	var blanc := Color(0.93, 0.9, 0.84, 1.0)
	var hauteur_m := y + 10.0
	_boite(s, Vector3(base.x, y - 0.5, base.y), Vector3(3.0, hauteur_m - y + 0.5, 3.0), blanc)
	_boite(s, Vector3(base.x, hauteur_m - 3.0, base.y), Vector3(4.2, 0.5, 4.2), blanc)
	_boite(s, Vector3(base.x, hauteur_m, base.y), Vector3(1.8, 2.0, 1.8), Color(0.2, 0.55, 0.32, 1.0))


func _boite(s: Dictionary, bas: Vector3, taille: Vector3, col: Color) -> void:
	var hx := taille.x / 2
	var hz := taille.z / 2
	var y0 := bas.y
	var y1 := bas.y + taille.y
	var c := [Vector3(-hx, 0, -hz), Vector3(hx, 0, -hz), Vector3(hx, 0, hz), Vector3(-hx, 0, hz)]
	var u := 0.0
	for k in 4:
		var a: Vector3 = bas + c[k]
		var b: Vector3 = bas + c[(k + 1) % 4]
		var nn := Vector3((a.z - b.z), 0, (b.x - a.x)).normalized()
		if nn.dot(Vector3(a.x + b.x - 2 * bas.x, 0, a.z + b.z - 2 * bas.z)) < 0: nn = -nn
		var a0 := Vector3(a.x, y0, a.z)
		var b0 := Vector3(b.x, y0, b.z)
		var a1 := Vector3(a.x, y1, a.z)
		var b1 := Vector3(b.x, y1, b.z)
		var L := a.distance_to(b)
		s.v.append_array([a0, b0, b1, a0, b1, a1])
		s.n.append_array([nn, nn, nn, nn, nn, nn])
		s.c.append_array([col, col, col, col, col, col])
		s.uv.append_array([Vector2(u, 0), Vector2(u + L, 0), Vector2(u + L, taille.y), Vector2(u, 0), Vector2(u + L, taille.y), Vector2(u, taille.y)])
		collisions.append_array([a0, b0, b1, a0, b1, a1])
		u += L
	var ct := Color(col, 0.0)
	var t := [Vector3(-hx, taille.y, -hz), Vector3(hx, taille.y, -hz), Vector3(hx, taille.y, hz), Vector3(-hx, taille.y, hz)]
	_tri(s, bas + t[0], bas + t[1], bas + t[2], Vector3.UP, ct)
	_tri(s, bas + t[0], bas + t[2], bas + t[3], Vector3.UP, ct)


# ------------------------------------------------------------------ routes
## classe : 0 autoroute/trunk … 8 sentier ; revêtement : 0 goudron, 1 latérite, 2 sable
func _route(cl: int, rv: int, pont: bool, larg: float, pts: PackedFloat32Array) -> void:
	var n := pts.size() / 2
	if n < 2: return
	var p := PackedVector2Array()
	for k in n: p.append(Vector2(pts[k * 2], pts[k * 2 + 1]))
	if cl <= 6: voies.append([p, larg, cl, pont])
	var dy := 0.03 + (9 - cl) * 0.004
	if rv == 0 and cl <= 3 and not pont:
		_ruban(p, larg + 5.0, 1, 9, 0.015, false)      # accotements de latérite poussiéreux
	_ruban(p, larg, rv, cl, dy, pont)
	if pont: _parapets(p, larg)
	elif cl <= 2: _lampadaires(p, larg)
	elif cl <= 5: _poteaux(p, larg)


func _ruban(p: PackedVector2Array, larg: float, rv: int, cl: int, dy: float, pont: bool) -> void:
	var s := _surf("route")
	var n := p.size()
	var v := 0.0
	var gauche := PackedVector3Array()
	var droite := PackedVector3Array()
	var vs := PackedFloat32Array()
	for k in n:
		var dir := Vector2.ZERO
		if k > 0: dir += (p[k] - p[k - 1]).normalized()
		if k < n - 1: dir += (p[k + 1] - p[k]).normalized()
		dir = dir.normalized()
		var perp := Vector2(-dir.y, dir.x)
		var miter := 1.0
		if k > 0 and k < n - 1:
			miter = clampf(1.0 / maxf(0.3, perp.dot(Vector2(-(p[k] - p[k - 1]).normalized().y, (p[k] - p[k - 1]).normalized().x))), 1.0, 2.5)
		var off := perp * larg * 0.5 * miter
		var y := (0.35 if pont else hauteur(p[k].x, p[k].y)) + dy
		if k > 0: v += p[k].distance_to(p[k - 1])
		# prolonge légèrement les extrémités pour boucher les jointures entre tuiles
		var ext := Vector2.ZERO
		if k == 0: ext = -dir * larg * 0.3
		elif k == n - 1: ext = dir * larg * 0.3
		gauche.append(Vector3(p[k].x + off.x + ext.x, y, p[k].y + off.y + ext.y))
		droite.append(Vector3(p[k].x - off.x + ext.x, y, p[k].y - off.y + ext.y))
		vs.append(v)
	var col := Color(cl / 10.0, rv / 2.0, 1.0 if pont else 0.0, larg / 40.0)
	for k in n - 1:
		var a := gauche[k]
		var b := droite[k]
		var c := droite[k + 1]
		var e := gauche[k + 1]
		_tri(s, a, b, c, Vector3.UP, col, Vector2(0, vs[k]), Vector2(1, vs[k]), Vector2(1, vs[k + 1]))
		_tri(s, a, c, e, Vector3.UP, col, Vector2(0, vs[k]), Vector2(1, vs[k + 1]), Vector2(0, vs[k + 1]))
		if pont: collisions.append_array([a, b, c, a, c, e])


func _parapets(p: PackedVector2Array, larg: float) -> void:
	var s := _surf("beton")
	var gris := Color(0.82, 0.8, 0.76)
	for k in p.size() - 1:
		var d := (p[k + 1] - p[k]).normalized()
		var perp := Vector2(-d.y, d.x)
		for cote in [-1.0, 1.0]:
			var o: Vector2 = perp * (larg * 0.5 + 0.2) * cote
			var a := p[k] + o
			var b := p[k + 1] + o
			var a0 := Vector3(a.x, -0.9, a.y)
			var b0 := Vector3(b.x, -0.9, b.y)
			var a1 := Vector3(a.x, 1.45, a.y)
			var b1 := Vector3(b.x, 1.45, b.y)
			var nn := Vector3(o.x, 0, o.y).normalized()
			_tri(s, a0, b0, b1, nn, gris)
			_tri(s, a0, b1, a1, nn, gris)
			collisions.append_array([a0, b0, b1, a0, b1, a1])
		# piles du pont tous les ~40 m
		var L := p[k].distance_to(p[k + 1])
		var t := 20.0
		while t < L:
			var q := p[k].lerp(p[k + 1], t / L)
			if hauteur(q.x, q.y) < -0.5:
				_boite(s, Vector3(q.x, -6.0, q.y), Vector3(2.5, 6.0, larg * 0.6), gris)
			t += 40.0


func _poteaux(p: PackedVector2Array, larg: float) -> void:
	# poteaux électriques en bois et câbles qui pendent, comme dans tous les quartiers de Niamey
	var cable := _surf("cable")
	var t := fposmod(p[0].x * 0.37 + p[0].y * 0.11, 30.0)
	var precedent := Vector3.INF
	for k in p.size() - 1:
		var L := p[k].distance_to(p[k + 1])
		var d := (p[k + 1] - p[k]).normalized()
		var perp := Vector2(-d.y, d.x)
		while t < L:
			var q := p[k].lerp(p[k + 1], t / L) + perp * (larg * 0.5 + 1.2)
			var y := hauteur(q.x, q.y)
			if y > -0.3:
				poteaux.append(Transform3D(Basis(Vector3.UP, atan2(d.x, d.y)), Vector3(q.x, y, q.y)))
				var sommet := Vector3(q.x, y + 7.6, q.y)
				if precedent != Vector3.INF and precedent.distance_to(sommet) < 60.0:
					for fil: float in [-0.5, 0.0, 0.5]:
						var o := Vector3(perp.x, 0, perp.y) * fil
						_fil(cable, precedent + o, sommet + o)
				precedent = sommet
			t += 34.0
		t -= L


func _fil(s: Dictionary, a: Vector3, b: Vector3) -> void:
	var seg := 6
	var prev := a
	var col := Color(0.05, 0.05, 0.05)
	for k in range(1, seg + 1):
		var f := float(k) / seg
		var q := a.lerp(b, f)
		q.y -= sin(f * PI) * 0.7  # flèche du câble
		var e := Vector3(0, 0.025, 0)
		_tri(s, prev - e, q - e, q + e, Vector3.UP, col)
		_tri(s, prev - e, q + e, prev + e, Vector3.UP, col)
		prev = q


func _lampadaires(p: PackedVector2Array, larg: float) -> void:
	var t := 12.0
	var cote := 1.0
	for k in p.size() - 1:
		var L := p[k].distance_to(p[k + 1])
		var d := (p[k + 1] - p[k]).normalized()
		var perp := Vector2(-d.y, d.x)
		while t < L:
			var q := p[k].lerp(p[k + 1], t / L) + perp * (larg * 0.5 + 0.8) * cote
			var y := hauteur(q.x, q.y)
			if y > -0.3:
				lampadaires.append(Transform3D(Basis(Vector3.UP, atan2(-perp.x * cote, -perp.y * cote)), Vector3(q.x, y, q.y)))
			t += 30.0
			cote = -cote
		t -= L
