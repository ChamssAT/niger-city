class_name Pnj
extends CharacterBody3D
## Passant : marche sur le bas-côté des vraies rues (données OSM), s'arrête, fuit le danger, peut être blessé.

signal tue(pnj: Pnj, par: Node)

enum Etat { MARCHE, PAUSE, FUITE, MORT }

var flux: FluxTuiles
var corps: CorpsHumain
var sante := 60.0
var etat := Etat.MARCHE
var temps_mort := 0.0
var _chemin := PackedVector2Array()
var _larg := 7.0
var _cote := 1.0
var _idx := 0
var _sens := 1
var _pause := 0.0
var _fuite := 0.0
var _vitesse_marche := randf_range(1.1, 1.6)
var _t_hauteur := 0.0


func _ready() -> void:
	collision_layer = Jeu.C_PNJ
	collision_mask = Jeu.C_MONDE
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.28
	cap.height = 1.7
	col.shape = cap
	col.position.y = 0.85
	add_child(col)
	if corps == null:
		corps = CorpsHumain.new()
		corps.construire(CorpsHumain.aleatoire())
	add_child(corps)


## Place le passant sur une voie : points de la route, largeur, côté (-1/1), index de départ, sens.
func placer(voie: Array, idx: int, sens: int, cote: float) -> void:
	_chemin = voie[0]
	_larg = voie[1]
	_cote = cote
	_idx = clampi(idx, 0, _chemin.size() - 1)
	_sens = sens
	var p := _point(_idx)
	global_position = Vector3(p.x, flux.hauteur(p.x, p.y) if flux else 0.0, p.y)


func _point(k: int) -> Vector2:
	var n := _chemin.size()
	var a := _chemin[clampi(k - 1, 0, n - 1)]
	var b := _chemin[clampi(k + 1, 0, n - 1)]
	var d := (b - a).normalized()
	return _chemin[k] + Vector2(-d.y, d.x) * (_larg * 0.5 + 1.7) * _cote


func _physics_process(delta: float) -> void:
	if etat == Etat.MORT:
		temps_mort += delta
		return
	var cible_v := 0.0
	var dir := Vector3.ZERO
	match etat:
		Etat.PAUSE:
			_pause -= delta
			if _pause <= 0.0: etat = Etat.MARCHE
		Etat.MARCHE, Etat.FUITE:
			if _chemin.size() < 2:
				etat = Etat.PAUSE
				_pause = 5.0
			else:
				var p := _point(_idx)
				var d := Vector2(p.x - global_position.x, p.y - global_position.z)
				if d.length() < 0.8:
					_idx += _sens
					if _idx < 0 or _idx >= _chemin.size():
						_suite_de_chemin()
					elif etat == Etat.MARCHE and randf() < 0.12:
						etat = Etat.PAUSE
						_pause = randf_range(2.0, 8.0)
				dir = Vector3(d.x, 0, d.y).normalized()
				cible_v = _vitesse_marche
				if etat == Etat.FUITE:
					cible_v = 5.2
					_fuite -= delta
					if _fuite <= 0.0: etat = Etat.MARCHE
	_deplacer(dir, cible_v, delta)


func _deplacer(dir: Vector3, v: float, delta: float) -> void:
	velocity = velocity.lerp(dir * v, minf(1.0, delta * 8.0))
	move_and_slide()
	_t_hauteur -= delta
	if _t_hauteur <= 0.0 and flux:
		_t_hauteur = 0.25
		global_position.y = flux.hauteur(global_position.x, global_position.z)
	var vh := Vector2(velocity.x, velocity.z)
	corps.vitesse = vh.length()
	if vh.length() > 0.2:
		corps.rotation.y = lerp_angle(corps.rotation.y, atan2(vh.x, vh.y), minf(1.0, delta * 8.0))


## Au bout de la rue : continue sur une rue qui part du même carrefour, sinon fait demi-tour.
func _suite_de_chemin() -> void:
	var fin := _chemin[clampi(_idx - _sens, 0, _chemin.size() - 1)]
	var options := []
	if flux:
		for v in flux.voies_proches(global_position, 40.0):
			var pts: PackedVector2Array = v[0]
			if pts == _chemin or pts.size() < 2: continue
			if pts[0].distance_to(fin) < 6.0: options.append([v, 0, 1])
			elif pts[-1].distance_to(fin) < 6.0: options.append([v, pts.size() - 1, -1])
	if options.is_empty():
		_sens = -_sens
		_idx = clampi(_idx + _sens * 2, 0, _chemin.size() - 1)
		return
	var o: Array = options[randi() % options.size()]
	_chemin = o[0][0]
	_larg = o[0][1]
	_idx = o[1]
	_sens = o[2]


func fuir(depuis: Vector3) -> void:
	if etat == Etat.MORT: return
	etat = Etat.FUITE
	_fuite = randf_range(4.0, 8.0)
	# part dans le sens qui l'éloigne du danger
	if _chemin.size() >= 2:
		var p := _point(clampi(_idx + _sens, 0, _chemin.size() - 1))
		var vers := Vector3(p.x, 0, p.y) - global_position
		if vers.dot(global_position - depuis) < 0.0: _sens = -_sens


func recevoir_degats(degats: float, _dir: Vector3, source: Node) -> void:
	if etat == Etat.MORT: return
	sante -= degats
	if sante <= 0.0:
		mourir(source)
	else:
		fuir(source.global_position if source is Node3D else global_position)


func mourir(par: Node) -> void:
	if etat == Etat.MORT: return
	etat = Etat.MORT
	velocity = Vector3.ZERO
	corps.vitesse = 0.0
	corps.tomber()
	for c in get_children():
		if c is CollisionShape3D: c.set_deferred("disabled", true)
	tue.emit(self, par)
