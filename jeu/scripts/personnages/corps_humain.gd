class_name CorpsHumain
extends Node3D
## Corps humain provisoire (primitives articulées) partagé par le héros, les passants et la police.
## Tenues : « boubou », « pagne », « jeune », « police ». Poses : marche/course, visée, mains levées, chute.
## Sera remplacé par un modèle riggé réaliste (voir FEUILLE_DE_ROUTE.md) sans changer cette interface.

const PEAUX := [Color(0.24, 0.15, 0.09), Color(0.3, 0.19, 0.11), Color(0.36, 0.23, 0.14), Color(0.2, 0.12, 0.08), Color(0.42, 0.28, 0.18)]
const BOUBOUS := [Color(0.13, 0.26, 0.55), Color(0.93, 0.92, 0.88), Color(0.3, 0.5, 0.35), Color(0.55, 0.35, 0.6), Color(0.75, 0.62, 0.3), Color(0.2, 0.2, 0.22), Color(0.6, 0.15, 0.15), Color(0.85, 0.8, 0.65)]
const PAGNES := [Color(0.85, 0.35, 0.05), Color(0.75, 0.1, 0.35), Color(0.1, 0.45, 0.7), Color(0.05, 0.55, 0.25), Color(0.9, 0.7, 0.1), Color(0.45, 0.15, 0.6)]

var tenue := "boubou"
var vitesse := 0.0         # m/s, pilote l'animation de marche
var visee := false
var mains_levees := false
var arme := ""             # "", "pistolet", "fusil"
var mort := false

var _m := {}
var _phase := randf() * TAU
var _chute := 0.0
var _arme_noeud: Node3D

static var _mailles := {}
static var _mats := {}


static func mat(c: Color, rugosite := 0.9) -> StandardMaterial3D:
	var cle := c.to_html() + str(rugosite)
	if not _mats.has(cle):
		var m := StandardMaterial3D.new()
		m.albedo_color = c
		m.roughness = rugosite
		_mats[cle] = m
	return _mats[cle]


static func maille(nom: String) -> Mesh:
	if _mailles.has(nom): return _mailles[nom]
	var m: Mesh
	match nom:
		"jambe":
			m = CapsuleMesh.new(); m.radius = 0.075; m.height = 0.9; m.radial_segments = 8; m.rings = 2
		"bras":
			m = CapsuleMesh.new(); m.radius = 0.065; m.height = 0.62; m.radial_segments = 8; m.rings = 2
		"buste":
			m = CapsuleMesh.new(); m.radius = 0.2; m.height = 0.55; m.radial_segments = 10; m.rings = 3
		"robe_longue":
			m = CylinderMesh.new(); m.top_radius = 0.2; m.bottom_radius = 0.33; m.height = 1.05; m.radial_segments = 10
		"robe_courte":
			m = CylinderMesh.new(); m.top_radius = 0.2; m.bottom_radius = 0.24; m.height = 0.5; m.radial_segments = 10
		"tete":
			m = SphereMesh.new(); m.radius = 0.11; m.height = 0.25; m.radial_segments = 12; m.rings = 6
		"calotte":
			m = CylinderMesh.new(); m.top_radius = 0.1; m.bottom_radius = 0.11; m.height = 0.1; m.radial_segments = 10
		"foulard":
			m = SphereMesh.new(); m.radius = 0.14; m.height = 0.24; m.radial_segments = 10; m.rings = 5
		"beret":
			m = CylinderMesh.new(); m.top_radius = 0.13; m.bottom_radius = 0.11; m.height = 0.06; m.radial_segments = 10
		"pistolet":
			m = BoxMesh.new(); m.size = Vector3(0.05, 0.13, 0.22)
		"fusil":
			m = BoxMesh.new(); m.size = Vector3(0.06, 0.1, 0.85)
	_mailles[nom] = m
	return m


static func aleatoire(t := "") -> Dictionary:
	if t == "": t = ["boubou", "boubou", "pagne", "pagne", "jeune"][randi() % 5]
	return {"tenue": t, "peau": PEAUX[randi() % PEAUX.size()], "couleur": (PAGNES if t == "pagne" else BOUBOUS)[randi() % (PAGNES.size() if t == "pagne" else BOUBOUS.size())],
		"couleur2": BOUBOUS[randi() % BOUBOUS.size()]}


func construire(look: Dictionary) -> void:
	tenue = look.tenue
	var peau: Color = look.peau
	var c1: Color = look.couleur
	var c2: Color = look.couleur2
	var pantalon := Color(0.88, 0.86, 0.8) if tenue == "boubou" else Color(0.15, 0.17, 0.25) if tenue in ["jeune", "police"] else c1
	if tenue == "police":
		c1 = Color(0.36, 0.43, 0.52)    # chemise gris-bleu de la PMF (police fictive)
		pantalon = Color(0.12, 0.14, 0.2)
	var buste := Node3D.new()
	add_child(buste)
	_m.buste = buste
	for nom in ["jambe_g", "jambe_d"]:
		var pivot := Node3D.new()
		pivot.position = Vector3(0.1 if nom == "jambe_g" else -0.1, 0.92, 0)
		add_child(pivot)
		_piece(pivot, "jambe", pantalon, Vector3(0, -0.45, 0))
		_m[nom] = pivot
	if tenue in ["boubou", "pagne"]:
		_piece(buste, "robe_longue", c1, Vector3(0, 0.98, 0))
	else:
		_piece(buste, "robe_courte", c1, Vector3(0, 1.2, 0))
	_piece(buste, "buste", c1 if tenue != "pagne" else c2, Vector3(0, 1.38, 0))
	_piece(buste, "tete", peau, Vector3(0, 1.68, 0), 0.55)
	match tenue:
		"boubou": _piece(buste, "calotte", Color(0.95, 0.94, 0.9), Vector3(0, 1.79, 0))
		"pagne": _piece(buste, "foulard", c2, Vector3(0, 1.74, -0.02))
		"police": _piece(buste, "beret", Color(0.05, 0.05, 0.06), Vector3(0.02, 1.8, 0))
	for nom in ["bras_g", "bras_d"]:
		var pivot := Node3D.new()
		pivot.position = Vector3(0.27 if nom == "bras_g" else -0.27, 1.5, 0)
		buste.add_child(pivot)
		_piece(pivot, "bras", c1 if tenue != "pagne" else c2, Vector3(0, -0.3, 0))
		_m[nom] = pivot


func _piece(parent: Node3D, nom: String, c: Color, pos: Vector3, rugosite := 0.9) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = maille(nom)
	mi.material_override = mat(c, rugosite)
	mi.position = pos
	mi.visibility_range_end = 70.0          # économise les appels de dessin sur les petites machines
	mi.visibility_range_end_margin = 5.0
	parent.add_child(mi)
	return mi


func donner_arme(type: String) -> void:
	arme = type
	if _arme_noeud: _arme_noeud.queue_free()
	_arme_noeud = null
	if type == "": return
	_arme_noeud = _piece(_m.bras_d, type, Color(0.08, 0.08, 0.09), Vector3(0, -0.6, 0.12 if type == "pistolet" else 0.3), 0.4)


func tomber() -> void:
	mort = true
	_chute = 0.0


func _process(delta: float) -> void:
	if mort:
		_chute = minf(1.0, _chute + delta * 2.5)
		rotation.x = -_chute * PI / 2.0 * 0.98
		position.y = -_chute * 0.05
		return
	_phase += delta * vitesse * 2.4
	var amp := clampf(vitesse / 4.0, 0.0, 1.0) * 0.6
	_m.jambe_g.rotation.x = sin(_phase) * amp
	_m.jambe_d.rotation.x = -sin(_phase) * amp
	_m.buste.position.y = absf(cos(_phase)) * 0.03 * amp
	if mains_levees:
		_m.bras_g.rotation = Vector3(0, 0, 2.9)
		_m.bras_d.rotation = Vector3(0, 0, -2.9)
	elif visee and arme != "":
		# bras tendus vers l'avant, arme à hauteur des yeux
		_m.bras_d.rotation = Vector3(-1.5, 0, 0)
		_m.bras_g.rotation = Vector3(-1.45, 0, -0.45 if arme == "pistolet" else -0.2)
	else:
		_m.bras_g.rotation = Vector3(-sin(_phase) * amp * 0.8, 0, 0.06)
		_m.bras_d.rotation = Vector3(sin(_phase) * amp * 0.8 - (0.4 if arme == "fusil" else 0.0), 0, -0.06)
