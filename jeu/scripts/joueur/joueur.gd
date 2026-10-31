class_name Joueur
extends CharacterBody3D
## Le héros : déplacement relatif à la caméra, course, saut, santé, armes et visée par-dessus l'épaule.

signal tir_effectue(pos: Vector3)
signal mort_survenue

const MARCHE := 1.6
const COURSE := 5.5
const SAUT := 4.8

var camera_rig: CameraSuivi
var vehicule: Voiture = null
var corps: CorpsHumain
var sante := 100.0
var gilet := 0.0
var arme := "pistolet"
var munitions := {"pistolet": [12, 60], "fusil": [30, 120]}   # [chargeur, réserve]
var vise := false
var _cadence := 0.0
var _recharge := 0.0
var _hors_combat := 0.0


func _ready() -> void:
	collision_layer = Jeu.C_JOUEUR
	collision_mask = Jeu.C_MONDE | Jeu.C_VEHICULE
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.3
	cap.height = 1.75
	col.shape = cap
	col.position.y = 0.875
	add_child(col)
	corps = CorpsHumain.new()
	corps.construire({"tenue": "boubou", "peau": Color(0.29, 0.18, 0.11), "couleur": Color(0.13, 0.26, 0.55), "couleur2": Color(0.13, 0.26, 0.55)})
	add_child(corps)
	corps.donner_arme(arme)
	floor_snap_length = 0.4


func _unhandled_input(event: InputEvent) -> void:
	if vehicule or sante <= 0.0: return
	for k in 3:
		if event.is_action_pressed("arme_%d" % k): changer_arme(Armes.ORDRE[k])
	if event.is_action_pressed("arme_suivante"):
		changer_arme(Armes.ORDRE[(Armes.ORDRE.find(arme) + 1) % Armes.ORDRE.size()])
	if event.is_action_pressed("recharger"): recharger()


func changer_arme(type: String) -> void:
	arme = type
	_recharge = 0.0
	corps.donner_arme(type)


func recharger() -> void:
	if arme == "" or _recharge > 0.0: return
	var m: Array = munitions[arme]
	if m[1] <= 0 or m[0] >= Armes.ARMES[arme].chargeur: return
	_recharge = Armes.ARMES[arme].recharge


func _physics_process(delta: float) -> void:
	if vehicule or sante <= 0.0:
		return
	_hors_combat += delta
	if _hors_combat > 6.0: sante = minf(100.0, sante + delta * 4.0)   # récupération lente hors combat
	vise = Input.is_action_pressed("viser") and arme != ""
	corps.visee = vise
	if camera_rig: camera_rig.visee = vise
	var entree := Input.get_vector("droite", "gauche", "reculer", "avancer")
	var lacet: float = camera_rig.lacet if camera_rig else 0.0
	var avant := Vector3(sin(lacet), 0, cos(lacet))
	var droite := Vector3(-avant.z, 0, avant.x)
	var dir := (avant * entree.y - droite * entree.x)
	if dir.length() > 1.0: dir = dir.normalized()
	var v := MARCHE * 0.8 if vise else (COURSE if Input.is_action_pressed("courir") else MARCHE)
	var cible := dir * v
	velocity.x = move_toward(velocity.x, cible.x, delta * 20.0)
	velocity.z = move_toward(velocity.z, cible.z, delta * 20.0)
	if is_on_floor():
		if Input.is_action_just_pressed("sauter") and not vise: velocity.y = SAUT
	else:
		velocity.y -= 9.81 * delta
	move_and_slide()
	if vise:
		corps.rotation.y = lerp_angle(corps.rotation.y, lacet, minf(1.0, delta * 20.0))
	elif dir.length() > 0.1:
		corps.rotation.y = lerp_angle(corps.rotation.y, atan2(dir.x, dir.z), minf(1.0, delta * 12.0))
	corps.vitesse = Vector2(velocity.x, velocity.z).length()
	_gerer_tir(delta)


func _gerer_tir(delta: float) -> void:
	_cadence -= delta
	if _recharge > 0.0:
		_recharge -= delta
		if _recharge <= 0.0:
			var m: Array = munitions[arme]
			var besoin: int = Armes.ARMES[arme].chargeur - m[0]
			var pris := mini(besoin, m[1])
			m[0] += pris
			m[1] -= pris
		return
	if arme == "": return
	var A: Dictionary = Armes.ARMES[arme]
	var appui := Input.is_action_pressed("tirer") if A.auto else Input.is_action_just_pressed("tirer")
	if not appui or _cadence > 0.0: return
	var m: Array = munitions[arme]
	if m[0] <= 0:
		Sons.jouer(get_parent(), "vide", global_position)
		recharger()
		_cadence = 0.3
		return
	m[0] -= 1
	_cadence = A.cadence
	# le rayon part de la caméra vers le centre de l'écran (là où est le réticule)
	var cam := camera_rig.camera
	var origine := cam.global_position
	var direction := -cam.global_transform.basis.z
	origine += direction * origine.distance_to(global_position + Vector3.UP * 1.4)   # démarre au niveau du joueur
	if not vise: direction = (direction + Vector3(randf_range(-1, 1), randf_range(-0.5, 0.5), randf_range(-1, 1)) * 0.04).normalized()
	Armes.tirer(get_world_3d(), get_parent(), self, origine, direction, arme, [get_rid()])
	camera_rig.secousse(0.15 if arme == "pistolet" else 0.1)
	tir_effectue.emit(global_position)
	if not vise: corps.rotation.y = camera_rig.lacet


func recevoir_degats(degats: float, _dir: Vector3, _source: Node) -> void:
	if sante <= 0.0: return
	_hors_combat = 0.0
	var absorbe := minf(gilet, degats * 0.7)
	gilet -= absorbe
	sante -= degats - absorbe
	if sante <= 0.0:
		sante = 0.0
		corps.tomber()
		mort_survenue.emit()


func ressusciter(pos: Vector3) -> void:
	sante = 100.0
	gilet = 0.0
	global_position = pos
	velocity = Vector3.ZERO
	corps.mort = false
	corps.rotation.x = 0.0
	corps.position.y = 0.0
	corps.mains_levees = false
