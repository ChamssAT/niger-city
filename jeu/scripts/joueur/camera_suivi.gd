class_name CameraSuivi
extends Node3D
## Caméra à la troisième personne : bras à ressort (évite de traverser les murs),
## souris / stick droit pour regarder, recentrage automatique derrière le véhicule.

var cible: Node3D
var lacet := 0.0
var tangage := -0.25
var camera: Camera3D
var _bras: SpringArm3D
var _repos := 10.0
var _loin := false
var visee := false
var _secousse := 0.0


func secousse(force: float) -> void:
	_secousse = maxf(_secousse, force)


func _ready() -> void:
	_bras = SpringArm3D.new()
	_bras.spring_length = 4.5
	_bras.margin = 0.3
	var sphere := SphereShape3D.new()
	sphere.radius = 0.25
	_bras.shape = sphere
	add_child(_bras)
	camera = Camera3D.new()
	camera.fov = 65.0
	camera.near = 0.1
	_bras.add_child(camera)
	camera.make_current()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		lacet -= event.relative.x * 0.0025
		tangage = clampf(tangage - event.relative.y * 0.002, -1.1, 0.35)
		_repos = 0.0
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event.is_action_pressed("camera"):
		_loin = not _loin


func _process(delta: float) -> void:
	if cible == null: return
	var droite_x := Input.get_joy_axis(0, JOY_AXIS_RIGHT_X)
	var droite_y := Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y)
	if absf(droite_x) > 0.15 or absf(droite_y) > 0.15:
		lacet -= droite_x * delta * 2.5
		tangage = clampf(tangage - droite_y * delta * 1.5, -1.1, 0.35)
		_repos = 0.0
	_repos += delta
	var v := cible as Voiture
	var hauteur := 1.6
	var longueur := 4.5
	if v:
		hauteur = 1.9 if v.modele != "minibus" else 2.6
		longueur = 7.5 if v.modele != "minibus" else 9.5
		# recentrage derrière le véhicule quand on ne touche pas la caméra
		if _repos > 1.5 and absf(v.vitesse) > 2.0:
			var cap := atan2(v.global_transform.basis.z.x, v.global_transform.basis.z.z)
			if v.vitesse < -2.0: cap += PI
			lacet = lerp_angle(lacet, cap, minf(1.0, delta * 2.0))
			tangage = lerpf(tangage, -0.18, delta)
		longueur += absf(v.vitesse) * 0.05
	if _loin and not visee: longueur *= 1.7
	if visee and not v:
		longueur = 1.9
		hauteur = 1.55
	_bras.spring_length = lerpf(_bras.spring_length, longueur, minf(1.0, delta * 4.0))
	var epaule := Vector3.ZERO
	if visee and not v:   # caméra par-dessus l'épaule droite
		epaule = Vector3(-cos(lacet), 0, sin(lacet)) * 0.65
	global_position = global_position.lerp(cible.global_position + Vector3(0, hauteur, 0) + epaule, minf(1.0, delta * 15.0))
	_secousse = maxf(0.0, _secousse - delta * 1.5)
	rotation = Vector3(tangage + randf_range(-1, 1) * _secousse * 0.05, lacet + PI + randf_range(-1, 1) * _secousse * 0.03, 0)
	if v:
		camera.fov = lerpf(camera.fov, 65.0 + minf(15.0, absf(v.vitesse) * 0.35), delta * 2.0)
	else:
		camera.fov = lerpf(camera.fov, 48.0 if visee else 65.0, minf(1.0, delta * 8.0))
