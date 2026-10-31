class_name Voiture
extends VehicleBody3D
## Véhicule à physique réaliste (suspensions, adhérence, masse) avec carrosserie procédurale.
## Les modèles définitifs (glTF) remplaceront la carrosserie sans changer la physique.

const MODELES := {
	# profil latéral (z, y) de l'arrière vers l'avant, dimensions, physique
	"taxi": {"nom": "Taxi", "profil": [[-2.02, 0.34], [-2.08, 0.78], [-1.98, 0.98], [-1.86, 1.3], [-1.58, 1.42], [0.12, 1.44], [0.82, 1.02], [1.92, 0.86], [2.05, 0.62], [2.02, 0.34]],
		"vitres": [[[-1.78, 1.02], [-1.55, 1.36], [-0.65, 1.38], [-0.65, 1.02]], [[-0.55, 1.02], [-0.55, 1.38], [0.1, 1.39], [0.72, 1.02]]],
		"pare_brise": [[0.8, 1.04], [0.14, 1.42]], "lunette": [[-1.6, 1.4], [-1.88, 1.06]],
		"larg": 1.7, "roue": 0.3, "empattement": [1.27, -1.25], "voie": 0.72, "masse": 1050.0, "force": 2300.0, "vmax": 42.0},
	"berline": {"nom": "Berline", "profil": [[-2.25, 0.34], [-2.3, 0.82], [-2.1, 0.98], [-1.35, 1.03], [-0.85, 1.45], [0.45, 1.47], [1.1, 1.04], [2.15, 0.9], [2.3, 0.62], [2.25, 0.34]],
		"vitres": [[[-1.25, 1.07], [-0.82, 1.41], [-0.2, 1.43], [-0.2, 1.07]], [[-0.1, 1.07], [-0.1, 1.43], [0.42, 1.44], [0.98, 1.07]]],
		"pare_brise": [[1.08, 1.06], [0.47, 1.45]], "lunette": [[-0.86, 1.44], [-1.33, 1.06]],
		"larg": 1.78, "roue": 0.32, "empattement": [1.38, -1.35], "voie": 0.76, "masse": 1250.0, "force": 2800.0, "vmax": 48.0},
	"police": {"nom": "Police PMF", "profil": [[-2.25, 0.34], [-2.3, 0.82], [-2.1, 0.98], [-1.35, 1.03], [-0.85, 1.45], [0.45, 1.47], [1.1, 1.04], [2.15, 0.9], [2.3, 0.62], [2.25, 0.34]],
		"vitres": [[[-1.25, 1.07], [-0.82, 1.41], [-0.2, 1.43], [-0.2, 1.07]], [[-0.1, 1.07], [-0.1, 1.43], [0.42, 1.44], [0.98, 1.07]]],
		"pare_brise": [[1.08, 1.06], [0.47, 1.45]], "lunette": [[-0.86, 1.44], [-1.33, 1.06]],
		"larg": 1.78, "roue": 0.32, "empattement": [1.38, -1.35], "voie": 0.76, "masse": 1300.0, "force": 3600.0, "vmax": 52.0},
	"4x4": {"nom": "4x4", "profil": [[-2.35, 0.5], [-2.4, 1.0], [-2.35, 1.82], [-2.15, 1.9], [0.55, 1.9], [1.25, 1.22], [2.3, 1.1], [2.42, 0.75], [2.38, 0.5]],
		"vitres": [[[-2.15, 1.25], [-2.15, 1.78], [-0.9, 1.8], [-0.9, 1.25]], [[-0.8, 1.25], [-0.8, 1.8], [0.5, 1.8], [1.08, 1.25]]],
		"pare_brise": [[1.2, 1.25], [0.58, 1.86]], "lunette": [[-2.37, 1.75], [-2.4, 1.15]],
		"larg": 1.9, "roue": 0.4, "empattement": [1.45, -1.45], "voie": 0.82, "masse": 2100.0, "force": 4200.0, "vmax": 45.0},
	"minibus": {"nom": "Faba-faba", "profil": [[-2.6, 0.42], [-2.65, 2.1], [-2.5, 2.25], [1.55, 2.25], [2.5, 1.25], [2.62, 0.98], [2.62, 0.42]],
		"vitres": [[[-2.4, 1.45], [-2.4, 2.02], [1.35, 2.02], [1.95, 1.45]]],
		"pare_brise": [[2.45, 1.32], [1.6, 2.18]], "lunette": [[-2.62, 2.0], [-2.65, 1.4]],
		"larg": 1.9, "roue": 0.35, "empattement": [1.7, -1.7], "voie": 0.8, "masse": 2000.0, "force": 3300.0, "vmax": 34.0},
}
const PEINTURES := [Color(0.95, 0.95, 0.94), Color(0.08, 0.08, 0.09), Color(0.55, 0.57, 0.6), Color(0.45, 0.08, 0.1), Color(0.12, 0.22, 0.42), Color(0.75, 0.7, 0.58), Color(0.32, 0.34, 0.36)]

const ADHERENCE := 2.0

var modele := "taxi"
var couleur := Color.WHITE
var conducteur: Node = null      # joueur ou IA
var commande := {"gaz": 0.0, "frein": 0.0, "direction": 0.0, "frein_main": false}
var vitesse := 0.0               # m/s le long de l'axe du véhicule
var roues: Array[VehicleWheel3D] = []
var _braquage := 0.0
var _feux_ar: StandardMaterial3D
var _phares: StandardMaterial3D
var _projecteur: SpotLight3D
var _t_retourne := 0.0
var sante := 100.0
var est_police := false
# conduite par l'IA (systemes/circulation.gd)
var ia_active := false
var ia_voie: Array = []
var ia_idx := 0
var ia_sens := 1
var ia_bloque := 0.0
var _gyro: Array[MeshInstance3D] = []
var _gyro_lumiere: OmniLight3D
var _gyro_actif := false
var _fumee: CPUParticles3D


static func creer(type: String, peinture := Color(-1, 0, 0)) -> Voiture:
	var v := Voiture.new()
	v.modele = type
	if peinture.r >= 0.0: v.couleur = peinture
	elif type == "taxi" or type == "police": v.couleur = Color(0.96, 0.96, 0.95)
	else: v.couleur = PEINTURES[randi() % PEINTURES.size()]
	return v


func _ready() -> void:
	var M: Dictionary = MODELES[modele]
	collision_layer = Jeu.C_VEHICULE
	collision_mask = Jeu.C_MONDE | Jeu.C_VEHICULE | Jeu.C_JOUEUR
	contact_monitor = true
	max_contacts_reported = 2
	body_entered.connect(_choc)
	mass = M.masse
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0, 0.15, 0.1)   # centre de gravité bas : la voiture ne se retourne plus dans les virages
	continuous_cd = true
	angular_damp = 0.4
	var col := CollisionShape3D.new()
	var b := BoxShape3D.new()
	var hauteur: float = M.profil.map(func(p): return p[1]).max()
	var y_bas: float = M.profil[0][1]
	b.size = Vector3(M.larg, hauteur - y_bas - 0.1, absf(M.profil[0][0]) + absf(M.profil[-1][0]))
	col.shape = b
	col.position = Vector3(0, (hauteur + y_bas) / 2.0, 0)
	add_child(col)
	add_child(_carrosserie(M))
	_projecteur = SpotLight3D.new()   # phares : vrai éclairage de la route la nuit
	_projecteur.position = Vector3(0, 0.8, M.profil[-1][0] + 0.1)
	_projecteur.rotation = Vector3(-0.08, PI, 0)
	_projecteur.spot_range = 45.0
	_projecteur.spot_angle = 38.0
	_projecteur.spot_attenuation = 0.8
	_projecteur.light_energy = 6.0
	_projecteur.light_color = Color(1.0, 0.95, 0.85)
	_projecteur.shadow_enabled = false
	_projecteur.visible = false
	add_child(_projecteur)
	for av in [true, false]:
		for cote in [-1.0, 1.0]:
			var w := VehicleWheel3D.new()
			w.position = Vector3(cote * M.voie, M.roue + 0.18, M.empattement[0] if av else M.empattement[1])
			w.wheel_radius = M.roue
			w.wheel_rest_length = 0.18
			w.suspension_travel = 0.22
			w.suspension_stiffness = 42.0 if M.masse < 1500 else 55.0
			w.suspension_max_force = M.masse * 12.0
			w.damping_compression = 0.85
			w.damping_relaxation = 1.0
			w.wheel_friction_slip = ADHERENCE
			w.wheel_roll_influence = 0.03
			w.use_as_steering = av
			w.use_as_traction = av if modele != "4x4" else true
			w.add_child(_roue(M.roue, cote))
			add_child(w)
			roues.append(w)


func _physics_process(delta: float) -> void:
	var M: Dictionary = MODELES[modele]
	vitesse = linear_velocity.dot(global_transform.basis.z)   # l'avant du véhicule est +Z
	var gaz: float = commande.gaz
	var frein: float = commande.frein
	# gaz/frein intelligents : la touche « reculer » freine d'abord, puis passe en marche arrière
	var force := 0.0
	var freinage := 0.0
	if gaz > 0.0:
		if vitesse < -1.0: freinage = 40.0 * gaz
		else: force = M.force * gaz * clampf(1.0 - vitesse / M.vmax, 0.0, 1.0)
	if frein > 0.0:
		if vitesse > 1.0: freinage = 40.0 * frein
		else: force = -M.force * 0.6 * frein * clampf(1.0 + vitesse / 10.0, 0.0, 1.0)
	if gaz == 0.0 and frein == 0.0: freinage = 2.0
	if sante <= 0.0: force = 0.0   # moteur détruit
	engine_force = force
	brake = freinage
	if commande.frein_main:
		roues[2].brake = 60.0
		roues[3].brake = 60.0
		roues[2].wheel_friction_slip = 1.0
		roues[3].wheel_friction_slip = 1.0
	else:
		roues[2].wheel_friction_slip = ADHERENCE
		roues[3].wheel_friction_slip = ADHERENCE
	# braquage dégressif avec la vitesse
	var max_braq := lerpf(0.6, 0.12, clampf(absf(vitesse) / 35.0, 0.0, 1.0))
	_braquage = move_toward(_braquage, commande.direction * max_braq, delta * 2.2)
	steering = _braquage
	_stabiliser(delta)
	if _feux_ar: _feux_ar.emission_energy_multiplier = 3.0 if freinage > 5.0 else 0.6


func allumer_phares(nuit: float) -> void:
	var allumes := nuit > 0.25 and conducteur != null
	if _phares: _phares.emission_energy_multiplier = (0.3 + nuit * 5.0) if allumes or nuit > 0.6 else 0.3
	if _projecteur: _projecteur.visible = allumes


func gyrophare(actif: bool) -> void:
	_gyro_actif = actif
	if _gyro_lumiere: _gyro_lumiere.visible = actif


func _process(_delta: float) -> void:
	if _gyro.is_empty(): return
	var t := Time.get_ticks_msec() / 1000.0
	var phase := fmod(t * 3.0, 1.0) < 0.5
	(_gyro[0].material_override as StandardMaterial3D).emission_energy_multiplier = 6.0 if _gyro_actif and phase else 0.2
	(_gyro[1].material_override as StandardMaterial3D).emission_energy_multiplier = 6.0 if _gyro_actif and not phase else 0.2
	if _gyro_lumiere and _gyro_actif:
		_gyro_lumiere.light_color = Color(1, 0.1, 0.1) if phase else Color(0.15, 0.3, 1)


func recevoir_degats(degats: float, _dir: Vector3, source: Node) -> void:
	sante -= degats * 0.6
	if source is Joueur and est_police and conducteur != source:
		var police = get_tree().get_first_node_in_group("police")
		if police: police.agression_policier()
	_mettre_a_jour_degats()


func _choc(corps: Node) -> void:
	var v := linear_velocity.length()
	if v > 9.0:
		sante -= (v - 9.0) * 2.0
		_mettre_a_jour_degats()
		if corps is Voiture and (corps as Voiture).est_police and conducteur is Joueur:
			var police = get_tree().get_first_node_in_group("police")
			if police: police.crime(1, global_position)


func _mettre_a_jour_degats() -> void:
	if sante < 35.0 and _fumee == null:   # fumée noire du moteur
		_fumee = CPUParticles3D.new()
		_fumee.amount = 24
		_fumee.lifetime = 2.0
		_fumee.direction = Vector3.UP
		_fumee.spread = 15.0
		_fumee.initial_velocity_min = 1.0
		_fumee.initial_velocity_max = 2.5
		_fumee.gravity = Vector3(0, 0.5, 0)
		_fumee.scale_amount_min = 0.25
		_fumee.scale_amount_max = 0.8
		var m := SphereMesh.new()
		m.radius = 0.5
		m.height = 1.0
		m.radial_segments = 6
		m.rings = 3
		var mt := StandardMaterial3D.new()
		mt.albedo_color = Color(0.12, 0.12, 0.12, 0.28)
		mt.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mt.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.material = mt
		_fumee.mesh = m
		_fumee.position = Vector3(0, 1.0, MODELES[modele].profil[-1][0] - 0.6)
		add_child(_fumee)


## Barre antiroulis : un couple ramène la caisse à l'horizontale (comme les barres stabilisatrices d'une vraie voiture).
## Si la voiture finit quand même sur le toit ou sur le flanc, elle est remise sur ses roues après 2 s.
func _stabiliser(delta: float) -> void:
	var haut := global_transform.basis.y
	var avant := global_transform.basis.z
	var correction := haut.cross(Vector3.UP)
	correction -= avant * correction.dot(avant) * 0.5            # laisse un peu de tangage (freinage, bosses)
	var w := angular_velocity
	var w_roulis := avant * w.dot(avant)
	apply_torque(correction * mass * 9.0 - w_roulis * mass * 1.2)
	if haut.y < 0.35 and linear_velocity.length() < 3.0:
		_t_retourne += delta
		if _t_retourne > 2.0:
			_t_retourne = 0.0
			var cap := atan2(avant.x, avant.z)
			global_transform = Transform3D(Basis(Vector3.UP, cap), global_position + Vector3.UP * 1.2)
			linear_velocity = Vector3.ZERO
			angular_velocity = Vector3.ZERO
	else:
		_t_retourne = 0.0


# ------------------------------------------------------------------ carrosserie
func _carrosserie(M: Dictionary) -> Node3D:
	var racine := Node3D.new()
	racine.name = "Carrosserie"
	var peinture := StandardMaterial3D.new()
	peinture.albedo_color = couleur
	peinture.metallic = 0.1 if couleur.v > 0.8 else 0.45   # blanc « taxi » : laque non métallisée
	peinture.roughness = 0.28
	peinture.cull_mode = BaseMaterial3D.CULL_DISABLED
	peinture.clearcoat_enabled = true
	peinture.clearcoat = 0.8
	peinture.clearcoat_roughness = 0.1
	var vitre := StandardMaterial3D.new()
	vitre.albedo_color = Color(0.05, 0.07, 0.08)
	vitre.metallic = 0.8
	vitre.roughness = 0.05
	vitre.cull_mode = BaseMaterial3D.CULL_DISABLED
	var noir := StandardMaterial3D.new()
	noir.albedo_color = Color(0.06, 0.06, 0.06)
	noir.roughness = 0.6
	_phares = StandardMaterial3D.new()
	_phares.albedo_color = Color(0.95, 0.95, 0.9)
	_phares.emission_enabled = true
	_phares.emission = Color(1.0, 0.95, 0.85)
	_phares.emission_energy_multiplier = 0.3
	_feux_ar = StandardMaterial3D.new()
	_feux_ar.albedo_color = Color(0.5, 0.02, 0.02)
	_feux_ar.emission_enabled = true
	_feux_ar.emission = Color(1.0, 0.08, 0.05)
	_feux_ar.emission_energy_multiplier = 0.6
	var L: float = M.larg
	racine.add_child(_mesh(_extrusion(M.profil, L, 0.07), peinture))
	for poly in M.vitres:
		for cote in [-1.0, 1.0]:
			var mi := _mesh(_extrusion(poly, 0.02, 0.0), vitre)
			mi.position.x = cote * (L / 2.0 + 0.005)
			racine.add_child(mi)
	for pv in [M.pare_brise, M.lunette]:
		racine.add_child(_mesh(_plaque(pv[0], pv[1], L - 0.14), vitre))
	var avant: float = M.profil[-1][0]
	var arriere: float = M.profil[0][0]
	for cote in [-1.0, 1.0]:
		racine.add_child(_boite(Vector3(0.32, 0.13, 0.05), Vector3(cote * (L / 2 - 0.28), 0.74, avant + 0.01), _phares))
		racine.add_child(_boite(Vector3(0.28, 0.14, 0.05), Vector3(cote * (L / 2 - 0.25), 0.84, arriere - 0.02), _feux_ar))
		racine.add_child(_boite(Vector3(0.16, 0.09, 0.12), Vector3(cote * (L / 2 + 0.07), 1.02, 0.85), noir))   # rétroviseurs
	racine.add_child(_boite(Vector3(L + 0.04, 0.2, 0.14), Vector3(0, 0.42, avant + 0.02), noir))   # pare-chocs
	racine.add_child(_boite(Vector3(L + 0.04, 0.2, 0.14), Vector3(0, 0.42, arriere - 0.02), noir))
	racine.add_child(_boite(Vector3(0.52, 0.14, 0.04), Vector3(0, 0.55, arriere - 0.06), noir))      # plaque
	if modele == "police":
		var vert := StandardMaterial3D.new()
		vert.albedo_color = Color(0.05, 0.5, 0.22)
		var orange := StandardMaterial3D.new()
		orange.albedo_color = Color(0.9, 0.38, 0.05)
		for cote in [-1.0, 1.0]:
			racine.add_child(_boite(Vector3(0.02, 0.12, 4.2), Vector3(cote * (L / 2 + 0.01), 0.78, 0.0), vert))
			racine.add_child(_boite(Vector3(0.02, 0.05, 4.2), Vector3(cote * (L / 2 + 0.01), 0.68, 0.0), orange))
			var t := Label3D.new()
			t.text = "POLICE · PMF"
			t.font_size = 40
			t.pixel_size = 0.004
			t.modulate = Color(0.05, 0.25, 0.12)
			t.position = Vector3(cote * (L / 2 + 0.02), 0.95, -0.2)
			t.rotation.y = -PI / 2 if cote > 0 else PI / 2
			racine.add_child(t)
		racine.add_child(_boite(Vector3(1.1, 0.08, 0.3), Vector3(0, 1.5, -0.2), noir))
		for k in 2:
			var mg := StandardMaterial3D.new()
			mg.albedo_color = Color(0.6, 0.05, 0.05) if k == 0 else Color(0.05, 0.1, 0.6)
			mg.emission_enabled = true
			mg.emission = Color(1, 0.1, 0.1) if k == 0 else Color(0.2, 0.35, 1)
			mg.emission_energy_multiplier = 0.2
			var g := _boite(Vector3(0.45, 0.14, 0.26), Vector3(-0.27 if k == 0 else 0.27, 1.6, -0.2), mg)
			racine.add_child(g)
			_gyro.append(g)
		_gyro_lumiere = OmniLight3D.new()
		_gyro_lumiere.position = Vector3(0, 1.9, -0.2)
		_gyro_lumiere.omni_range = 14.0
		_gyro_lumiere.light_energy = 2.5
		_gyro_lumiere.visible = false
		racine.add_child(_gyro_lumiere)
	if modele == "taxi":
		var jaune := StandardMaterial3D.new()
		jaune.albedo_color = Color(1.0, 0.82, 0.1)
		jaune.emission_enabled = true
		jaune.emission = Color(1.0, 0.8, 0.2)
		jaune.emission_energy_multiplier = 0.2
		racine.add_child(_boite(Vector3(0.75, 0.2, 0.3), Vector3(0, 1.55, -0.6), jaune))
		for cote in [-1.0, 1.0]:
			var t := Label3D.new()
			t.text = "TAXI"
			t.font_size = 36
			t.pixel_size = 0.004
			t.modulate = Color(0.05, 0.05, 0.05)
			t.position = Vector3(0, 1.55, -0.6 + cote * 0.153)
			t.rotation.y = 0.0 if cote > 0 else PI
			racine.add_child(t)
		var num := Label3D.new()   # numéro de taxi peint en rouge à l'arrière
		num.text = str(1000 + randi() % 3000)
		num.font_size = 48
		num.pixel_size = 0.004
		num.modulate = Color(0.75, 0.05, 0.05)
		num.outline_size = 0
		num.position = Vector3(0, 1.12, arriere - 0.06)
		num.rotation.y = PI
		racine.add_child(num)
	return racine


func _roue(r: float, cote: float) -> Node3D:
	var n := Node3D.new()
	var pneu := CylinderMesh.new()
	pneu.top_radius = r
	pneu.bottom_radius = r
	pneu.height = 0.22
	pneu.radial_segments = 20
	var mp := StandardMaterial3D.new()
	mp.albedo_color = Color(0.06, 0.06, 0.06)
	mp.roughness = 0.9
	var jante := CylinderMesh.new()
	jante.top_radius = r * 0.62
	jante.bottom_radius = r * 0.62
	jante.height = 0.235
	jante.radial_segments = 12
	var mj := StandardMaterial3D.new()
	mj.albedo_color = Color(0.75, 0.75, 0.76)
	mj.metallic = 1.0
	mj.roughness = 0.25
	for p in [[pneu, mp], [jante, mj]]:
		var mi := MeshInstance3D.new()
		mi.mesh = p[0]
		mi.material_override = p[1]
		mi.rotation.z = PI / 2
		n.add_child(mi)
	n.position.x = cote * 0.02
	return n


func _mesh(m: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.visibility_range_end = 300.0
	return mi


func _boite(taille: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = taille
	var mi := _mesh(bm, mat)
	mi.position = pos
	return mi


## Extrusion d'un profil (z, y) sur la largeur (axe X), avec biseau léger sur les arêtes.
func _extrusion(profil: Array, largeur: float, biseau: float) -> ArrayMesh:
	var poly := PackedVector2Array()
	for p in profil: poly.append(Vector2(p[0], p[1]))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var demi := largeur / 2.0
	var idx := Geometry2D.triangulate_polygon(poly)
	var interieur := Geometry2D.offset_polygon(poly, -biseau)
	var flanc: PackedVector2Array = interieur[0] if biseau > 0.0 and not interieur.is_empty() else poly
	var idx_f := Geometry2D.triangulate_polygon(flanc)
	for cote in [-1.0, 1.0]:
		for t in range(0, idx_f.size(), 3):
			var tri := [flanc[idx_f[t]], flanc[idx_f[t + 1]], flanc[idx_f[t + 2]]]
			if cote < 0: tri.reverse()
			for q in tri:
				st.set_normal(Vector3(cote, 0, 0))
				st.add_vertex(Vector3(cote * demi, q.y, q.x))
	# pourtour (avec biseau entre le flanc rétréci et le bord)
	var n := poly.size()
	var sens := 1.0 if _aire(poly) > 0 else -1.0
	for k in n:
		var a := poly[k]
		var b := poly[(k + 1) % n]
		var d := (b - a).normalized()
		var nn := Vector3(0, d.x, -d.y) * sens   # normale extérieure du pourtour
		var x_int := demi - biseau
		var quad := [Vector3(-x_int, a.y, a.x), Vector3(x_int, a.y, a.x), Vector3(x_int, b.y, b.x), Vector3(-x_int, b.y, b.x)]
		for t in [[0, 1, 2], [0, 2, 3]]:
			var tri := [quad[t[0]], quad[t[1]], quad[t[2]]]
			if sens < 0: tri.reverse()
			for q in tri:
				st.set_normal(nn)
				st.add_vertex(q)
		if biseau > 0.0 and flanc.size() == n:
			for cote in [-1.0, 1.0]:
				var fa := flanc[k]
				var fb := flanc[(k + 1) % n]
				var q4 := [Vector3(cote * x_int, a.y, a.x), Vector3(cote * demi, fa.y, fa.x), Vector3(cote * demi, fb.y, fb.x), Vector3(cote * x_int, b.y, b.x)]
				var nb := (nn + Vector3(cote, 0, 0)).normalized()
				for t in [[0, 1, 2], [0, 2, 3]]:
					var tri := [q4[t[0]], q4[t[1]], q4[t[2]]]
					if (sens < 0) != (cote < 0): tri.reverse()
					for q in tri:
						st.set_normal(nb)
						st.add_vertex(q)
	return st.commit()


func _plaque(a: Array, b: Array, largeur: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var d := Vector2(b[0] - a[0], b[1] - a[1]).normalized()
	var n := Vector3(0, -d.x, d.y)
	if n.y < 0: n = -n
	var off := n * 0.012
	var h := largeur / 2.0
	var p := [Vector3(-h, a[1], a[0]) + off, Vector3(h, a[1], a[0]) + off, Vector3(h, b[1], b[0]) + off, Vector3(-h, b[1], b[0]) + off]
	for t in [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]:
		for k in t:
			st.set_normal(n)
			st.add_vertex(p[k])
	return st.commit()


func _aire(p: PackedVector2Array) -> float:
	var s := 0.0
	for k in p.size():
		s += p[k].x * p[(k + 1) % p.size()].y - p[(k + 1) % p.size()].x * p[k].y
	return s
