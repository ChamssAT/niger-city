class_name Circulation
extends Node3D
## Voitures conduites par l'IA sur les vraies rues : roulent à droite, suivent les rues de carrefour en carrefour,
## freinent devant les obstacles, klaxonnent quand ça bloque (comme à Niamey).

const TYPES := ["taxi", "taxi", "taxi", "taxi", "berline", "berline", "4x4", "minibus"]

var flux: FluxTuiles
var joueur: Joueur
var vehicules: Array[Voiture]   # liste partagée avec la scène (pour entrer dans les voitures)
var ia: Array[Voiture] = []
var _t := 0.0


func _physics_process(delta: float) -> void:
	if joueur == null: return
	var centre := joueur.vehicule.global_position if joueur.vehicule else joueur.global_position
	_t -= delta
	if _t <= 0.0:
		_t = 1.0
		_entretenir(centre)
	for v in ia:
		if is_instance_valid(v) and v.ia_active: _conduire(v, delta)


func _entretenir(centre: Vector3) -> void:
	for k in range(ia.size() - 1, -1, -1):
		var v := ia[k]
		if not is_instance_valid(v):
			ia.remove_at(k)
			continue
		var bloquee: bool = v.ia_bloque > 30.0
		if v.ia_active and (v.global_position.distance_to(centre) > 230.0 or bloquee):
			retirer(v)
			v.queue_free()
	var cible: int = Jeu.EFFECTIFS[Jeu.qualite][1]
	var n_ia := ia.filter(func(v): return v.ia_active and not v.est_police).size()
	if n_ia < cible: apparaitre(centre, 70.0, 190.0, TYPES[randi() % TYPES.size()])


func apparaitre(centre: Vector3, rmin: float, rmax: float, type: String) -> Voiture:
	var voies := flux.voies_proches(centre, rmax).filter(func(v): return v[2] <= 5)
	if voies.is_empty(): return null
	for _essai in 10:
		var voie: Array = voies[randi() % voies.size()]
		var pts: PackedVector2Array = voie[0]
		if pts.size() < 2: continue
		var k := 1 + randi() % (pts.size() - 1)
		var d := Vector2(pts[k].x - centre.x, pts[k].y - centre.z).length()
		if d < rmin or d > rmax: continue
		var sens := 1 if randf() < 0.5 else -1
		var a := pts[k - 1] if sens == 1 else pts[k]
		var b := pts[k] if sens == 1 else pts[k - 1]
		var dir := (b - a).normalized()
		var pos2: Vector2 = a.lerp(b, 0.5) + Vector2(-dir.y, dir.x) * -voie[1] * 0.25
		var v := Voiture.creer(type)
		v.ia_active = true
		v.ia_voie = voie
		v.ia_idx = k if sens == 1 else k - 1
		v.ia_sens = sens
		v.conducteur = self
		add_child(v)
		v.global_position = Vector3(pos2.x, flux.hauteur(pos2.x, pos2.y) + 0.7, pos2.y)
		v.rotation.y = atan2(dir.x, dir.y)
		v.linear_velocity = Vector3(dir.x, 0, dir.y) * 6.0
		ia.append(v)
		vehicules.append(v)
		return v
	return null


func retirer(v: Voiture) -> void:
	ia.erase(v)
	vehicules.erase(v)
	v.ia_active = false


func _cible(v: Voiture) -> Vector2:
	var pts: PackedVector2Array = v.ia_voie[0]
	var i: int = clampi(v.ia_idx, 0, pts.size() - 1)
	var prec: int = clampi(i - v.ia_sens, 0, pts.size() - 1)
	var dir := (pts[i] - pts[prec]).normalized() if i != prec else Vector2(sin(v.rotation.y), cos(v.rotation.y))
	return pts[i] + Vector2(-dir.y, dir.x) * -v.ia_voie[1] * 0.25   # voie de droite


func _conduire(v: Voiture, delta: float) -> void:
	var pts: PackedVector2Array = v.ia_voie[0]
	var pos := Vector2(v.global_position.x, v.global_position.z)
	var cible := _cible(v)
	if pos.distance_to(cible) < 6.0:
		v.ia_idx += v.ia_sens
		if v.ia_idx < 0 or v.ia_idx >= pts.size(): _carrefour(v, pts[clampi(v.ia_idx - v.ia_sens, 0, pts.size() - 1)])
		cible = _cible(v)
	var avant := v.global_transform.basis.z
	var vers := Vector3(cible.x - pos.x, 0, cible.y - pos.y).normalized()
	var angle := atan2(avant.cross(vers).y, avant.dot(vers))
	var cl: int = v.ia_voie[2]
	var v_max := 13.0 if cl <= 2 else (10.0 if cl <= 4 else 7.0)
	v_max *= 1.0 - minf(0.6, absf(angle))
	if _obstacle(v, avant):
		v_max = 0.0
		v.ia_bloque += delta
		if v.ia_bloque > 2.5 and fmod(v.ia_bloque, 4.0) < delta: Sons.jouer(get_parent(), "klaxon", v.global_position, -4.0)
	else:
		v.ia_bloque = maxf(0.0, v.ia_bloque - delta)
	v.commande.direction = clampf(angle * 2.2, -1.0, 1.0)
	v.commande.gaz = clampf((v_max - v.vitesse) * 0.3, 0.0, 1.0)
	v.commande.frein = clampf((v.vitesse - v_max) * 0.3, 0.0, 1.0) if v.vitesse > v_max + 1.0 else (1.0 if v_max == 0.0 and v.vitesse > 0.3 else 0.0)
	v.commande.frein_main = false


func _carrefour(v: Voiture, fin: Vector2) -> void:
	var options := []
	for o in flux.voies_proches(v.global_position, 40.0):
		var p: PackedVector2Array = o[0]
		if o[2] > 5 or p == v.ia_voie[0] or p.size() < 2: continue
		if p[0].distance_to(fin) < 7.0: options.append([o, 1, 1])
		elif p[-1].distance_to(fin) < 7.0: options.append([o, p.size() - 2, -1])
	if options.is_empty():   # impasse : demi-tour
		v.ia_sens = -v.ia_sens
		v.ia_idx = clampi(v.ia_idx + v.ia_sens * 2, 0, (v.ia_voie[0] as PackedVector2Array).size() - 1)
		return
	var c: Array = options[randi() % options.size()]
	v.ia_voie = c[0]
	v.ia_idx = c[1]
	v.ia_sens = c[2]


func _obstacle(v: Voiture, avant: Vector3) -> bool:
	var portee := 7.0 + absf(v.vitesse) * 0.9
	var test := func(p: Vector3, largeur: float) -> bool:
		var d := p - v.global_position
		var devant := d.dot(avant)
		return devant > 0.5 and devant < portee and absf(d.dot(v.global_transform.basis.x)) < largeur
	for o in vehicules:
		if o != v and is_instance_valid(o) and test.call(o.global_position, 2.2): return true
	if not joueur.vehicule and test.call(joueur.global_position, 1.6): return true
	return false
