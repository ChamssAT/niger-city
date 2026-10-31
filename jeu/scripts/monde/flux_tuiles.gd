class_name FluxTuiles
extends Node3D
## Charge les tuiles de la ville autour d'une cible (joueur ou véhicule) et décharge celles qui s'éloignent.
## La géométrie est calculée dans des threads (WorkerThreadPool) ; seuls les nœuds sont créés sur le thread principal.

const MAX_PAR_IMAGE := 2

var cible: Node3D
var materiaux: Dictionary
var mailles_arbres: Dictionary   # espèce -> Mesh
var maille_poteau: Mesh
var maille_lampadaire: Mesh

var _tuiles := {}          # Vector2i -> Node3D
var _en_cours := {}        # Vector2i -> {tache, constructeur}
var _prets: Array = []
var _verrou := Mutex.new()
var _sol_lointain: MeshInstance3D


func _ready() -> void:
	Jeu.qualite_changee.connect(func(_n): _appliquer_distances())


func _process(_delta: float) -> void:
	if cible == null: return
	var p := cible.global_position
	var centre := Vector2i(floori(p.x / Jeu.tuile), floori(p.z / Jeu.tuile))
	var r: int = Jeu.q("rayon")
	# demandes, des plus proches aux plus lointaines
	var voulues: Array[Vector2i] = []
	for dj in range(-r, r + 1):
		for di in range(-r, r + 1):
			if di * di + dj * dj <= r * r + 1:
				voulues.append(centre + Vector2i(di, dj))
	voulues.sort_custom(func(a, b): return (a - centre).length_squared() < (b - centre).length_squared())
	for k in voulues:
		if not _tuiles.has(k) and not _en_cours.has(k) and _en_cours.size() < 6:
			var c := ConstructeurTuile.new(k.x, k.y, Jeu.tuile)
			var id := -1
			if "--sans-threads" in OS.get_cmdline_user_args():
				c.construire()
			else:
				id = WorkerThreadPool.add_task(c.construire, false, "tuile")
			_en_cours[k] = {"tache": id, "c": c}
	# assemblage des tuiles terminées (budget limité par image pour éviter les à-coups)
	var faites := 0
	for k in _en_cours.keys():
		if faites >= MAX_PAR_IMAGE: break
		var e: Dictionary = _en_cours[k]
		if e.tache < 0 or WorkerThreadPool.is_task_completed(e.tache):
			if e.tache >= 0: WorkerThreadPool.wait_for_task_completion(e.tache)
			_en_cours.erase(k)
			if (k - centre).length_squared() <= (r + 1) * (r + 1):
				_tuiles[k] = _assembler(e.c)
				add_child(_tuiles[k])
			faites += 1
	# déchargement
	for k in _tuiles.keys():
		if (k - centre).length_squared() > (r + 2) * (r + 2):
			_tuiles[k].queue_free()
			_tuiles.erase(k)
	if _sol_lointain:
		_sol_lointain.global_position = Vector3(p.x, -0.05, p.z)


## Positions des lampes des lampadaires chargés (pour les vraies lumières proches du joueur).
func lampes() -> PackedVector3Array:
	var res := PackedVector3Array()
	for t in _tuiles.values():
		if t.has_meta("lampes"): res.append_array(t.get_meta("lampes"))
	return res


## Hauteur du sol (relief du fleuve compris) ; 0 si la tuile n'est pas chargée.
func hauteur(x: float, z: float) -> float:
	var t: Node3D = _tuiles.get(Vector2i(floori(x / Jeu.tuile), floori(z / Jeu.tuile)))
	if t == null or not t.has_meta("c"): return 0.0
	return (t.get_meta("c") as ConstructeurTuile).hauteur(x, z)


## Voies (routes) des tuiles chargées à moins de « rayon » mètres : [points, largeur, classe, pont].
func voies_proches(p: Vector3, rayon: float) -> Array:
	var res := []
	var r := ceili(rayon / Jeu.tuile)
	var c0 := Vector2i(floori(p.x / Jeu.tuile), floori(p.z / Jeu.tuile))
	for dj in range(-r, r + 1):
		for di in range(-r, r + 1):
			var t: Node3D = _tuiles.get(c0 + Vector2i(di, dj))
			if t and t.has_meta("c"): res.append_array((t.get_meta("c") as ConstructeurTuile).voies)
	return res


func nb_tuiles() -> int:
	return _tuiles.size()


## Hauteur du sol au point donné (utile pour poser véhicules et piétons).
func pret_autour(p: Vector3) -> bool:
	return _tuiles.has(Vector2i(floori(p.x / Jeu.tuile), floori(p.z / Jeu.tuile)))


func creer_sol_lointain() -> void:
	# grand plan de sable sous la ville, jusqu'à l'horizon (évite le vide au-delà des tuiles chargées)
	_sol_lointain = MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(12000, 12000)
	_sol_lointain.mesh = pm
	_sol_lointain.material_override = materiaux.sol
	_sol_lointain.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_sol_lointain)


func _assembler(c: ConstructeurTuile) -> Node3D:
	var racine := Node3D.new()
	racine.name = "Tuile_%d_%d" % [c.i, c.j]
	if not c.ok: return racine
	racine.set_meta("c", c)
	for nom in c.surfaces:
		var s: Dictionary = c.surfaces[nom]
		if s.v.is_empty(): continue
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = s.v
		arr[Mesh.ARRAY_NORMAL] = s.n
		arr[Mesh.ARRAY_COLOR] = s.c
		arr[Mesh.ARRAY_TEX_UV] = s.uv
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		var mi := MeshInstance3D.new()
		mi.mesh = m
		mi.material_override = materiaux[nom]
		if nom in ["route", "sol", "cable"]:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		racine.add_child(mi)
	if c.a_eau:
		var eau := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(Jeu.tuile, Jeu.tuile)
		eau.mesh = pm
		eau.material_override = materiaux.eau
		eau.position = Vector3((c.i + 0.5) * Jeu.tuile, ConstructeurTuile.PROF_EAU + 0.05, (c.j + 0.5) * Jeu.tuile)
		eau.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		racine.add_child(eau)
	# arbres, poteaux et lampadaires : MultiMesh (un seul appel de dessin par type)
	for esp in c.arbres:
		racine.add_child(_multi(mailles_arbres.get(esp, mailles_arbres[0]), c.arbres[esp], "dist_arbres"))
	if not c.poteaux.is_empty(): racine.add_child(_multi(maille_poteau, c.poteaux, "dist_props"))
	if not c.lampadaires.is_empty(): racine.add_child(_multi(maille_lampadaire, c.lampadaires, "dist_props"))
	var tetes := PackedVector3Array()
	for xf in c.lampadaires: tetes.append(xf * Vector3(0, 8.8, 2.0))
	racine.set_meta("lampes", tetes)
	# collisions : sol plat + murs / ponts / berges
	var corps := StaticBody3D.new()
	if c.relief.is_empty():
		var sol := CollisionShape3D.new()
		var b := BoxShape3D.new()
		b.size = Vector3(Jeu.tuile, 2.0, Jeu.tuile)
		sol.shape = b
		sol.position = Vector3((c.i + 0.5) * Jeu.tuile, -1.0, (c.j + 0.5) * Jeu.tuile)
		corps.add_child(sol)
	if not c.collisions.is_empty():
		var cs := CollisionShape3D.new()
		var sh := ConcavePolygonShape3D.new()
		sh.backface_collision = true
		sh.set_faces(c.collisions)
		cs.shape = sh
		corps.add_child(cs)
	racine.add_child(corps)
	c.surfaces.clear()          # libère la mémoire : on ne garde que le relief et les voies
	c.collisions = PackedVector3Array()
	c.arbres.clear()
	return racine


func _multi(maille: Mesh, transfos: Array, cle_dist: String) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = maille
	mm.instance_count = transfos.size()
	for k in transfos.size():
		mm.set_instance_transform(k, transfos[k])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.set_meta("cle_dist", cle_dist)
	mmi.visibility_range_end = Jeu.q(cle_dist)
	mmi.visibility_range_end_margin = 30.0
	mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	return mmi


func _appliquer_distances() -> void:
	for t in _tuiles.values():
		for n in t.get_children():
			if n is MultiMeshInstance3D:
				n.visibility_range_end = Jeu.q(n.get_meta("cle_dist"))
