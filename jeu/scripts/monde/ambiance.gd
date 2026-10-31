class_name Ambiance
extends Node3D
## Ciel, soleil, brouillard, cycle jour/nuit et météo (saison sèche, harmattan, pluie).

const PRESETS := {
	# ciel haut, horizon, brume (couleur, densité), lumière du soleil, nébulosité
	"sec":       {"haut": Color(0.36, 0.56, 0.82), "horizon": Color(0.78, 0.8, 0.78), "brume": Color(0.8, 0.78, 0.7),  "densite": 0.0007, "soleil": 1.0,  "nuages": 0.1},
	"harmattan": {"haut": Color(0.62, 0.62, 0.6),  "horizon": Color(0.82, 0.74, 0.62), "brume": Color(0.8, 0.7, 0.56), "densite": 0.0045, "soleil": 0.55, "nuages": 0.0},
	"pluie":     {"haut": Color(0.42, 0.45, 0.48), "horizon": Color(0.6, 0.62, 0.63), "brume": Color(0.55, 0.57, 0.58), "densite": 0.0035, "soleil": 0.25, "nuages": 1.0},
}

var env: Environment
var soleil: DirectionalLight3D
var lune: DirectionalLight3D
var flux: FluxTuiles
var _lumieres: Array[OmniLight3D] = []
var _t_lumieres := 0.0
var ciel: ProceduralSkyMaterial
var pluie: GPUParticles3D
var camera: Camera3D
var lampes: Array[StandardMaterial3D] = []
var _p := {}      # préréglage courant (interpolé)
var _humidite := 0.0


func _ready() -> void:
	ciel = ProceduralSkyMaterial.new()
	ciel.sun_angle_max = 8.0
	ciel.sun_curve = 0.1
	var sky := Sky.new()
	sky.sky_material = ciel
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.75
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.tonemap_white = 6.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_sun_scatter = 0.25
	env.fog_aerial_perspective = 0.4
	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.2
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.05
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	soleil = DirectionalLight3D.new()
	soleil.shadow_enabled = true
	soleil.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	soleil.directional_shadow_max_distance = 140.0
	soleil.shadow_blur = 1.5
	soleil.light_angular_distance = 0.6
	add_child(soleil)

	lune = DirectionalLight3D.new()   # clair de lune bleuté
	lune.light_color = Color(0.55, 0.65, 1.0)
	lune.rotation = Vector3(-1.0, 0.6, 0)
	lune.shadow_enabled = false
	lune.light_energy = 0.0
	add_child(lune)
	for k in 8:
		var o := OmniLight3D.new()
		o.light_color = Color(1.0, 0.78, 0.48)   # sodium chaud des lampadaires de Niamey
		o.omni_range = 22.0
		o.omni_attenuation = 1.2
		o.light_energy = 0.0
		o.shadow_enabled = false
		add_child(o)
		_lumieres.append(o)
	if not "--sans-pluie" in OS.get_cmdline_user_args(): _creer_pluie()
	_p = PRESETS[Jeu.meteo].duplicate()
	Jeu.qualite_changee.connect(func(_n): appliquer_qualite())
	appliquer_qualite()


func appliquer_qualite() -> void:
	soleil.shadow_enabled = Jeu.q("ombres")
	env.ssao_enabled = Jeu.q("ssao")
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.5
	get_viewport().scaling_3d_scale = Jeu.q("echelle")


func _creer_pluie() -> void:
	pluie = GPUParticles3D.new()
	pluie.amount = 6000
	pluie.lifetime = 1.2
	pluie.visibility_aabb = AABB(Vector3(-40, -30, -40), Vector3(80, 60, 80))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(35, 1, 35)
	pm.direction = Vector3(0.1, -1, 0.05)
	pm.spread = 3.0
	pm.initial_velocity_min = 22.0
	pm.initial_velocity_max = 26.0
	pm.gravity = Vector3(0, -9.8, 0)
	pluie.process_material = pm
	var goutte := QuadMesh.new()
	goutte.size = Vector2(0.02, 0.6)
	var mg := StandardMaterial3D.new()
	mg.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mg.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mg.albedo_color = Color(0.8, 0.85, 0.9, 0.35)
	mg.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	goutte.material = mg
	pluie.draw_pass_1 = goutte
	pluie.emitting = false
	add_child(pluie)


func _process(delta: float) -> void:
	var cible: Dictionary = PRESETS[Jeu.meteo]
	var k := minf(1.0, delta * 0.5)
	for c in cible:
		_p[c] = lerp(_p[c], cible[c], k)
	# trajectoire du soleil (Niamey : 13,5° N, le soleil passe au sud)
	var h := Jeu.heure
	var a := (h - 6.0) / 12.0 * PI
	var elev := sin(a)
	var jour := clampf((elev + 0.08) / 0.3, 0.0, 1.0)
	var crepuscule := clampf(1.0 - absf(elev) / 0.28, 0.0, 1.0) * (1.0 if elev > -0.12 else 0.0)
	var dir := Vector3(cos(a), maxf(elev, -0.3), 0.35).normalized()
	soleil.look_at_from_position(Vector3.ZERO, -dir, Vector3.UP if absf(dir.y) < 0.99 else Vector3.FORWARD)
	var couleur_soleil := Color(1.0, 0.95, 0.86).lerp(Color(1.0, 0.55, 0.28), crepuscule * 0.85)
	soleil.light_color = couleur_soleil
	soleil.light_energy = 2.2 * jour * _p.soleil
	soleil.visible = jour > 0.01
	# ciel
	var nuit := 1.0 - jour
	var haut: Color = _p.haut
	var horizon: Color = _p.horizon
	haut = haut.lerp(Color(0.04, 0.07, 0.16), nuit).lerp(Color(0.35, 0.3, 0.4), crepuscule * 0.4)
	horizon = horizon.lerp(Color(0.12, 0.14, 0.22), nuit).lerp(Color(0.95, 0.55, 0.3), crepuscule * 0.6)
	ciel.sky_top_color = haut
	ciel.sky_horizon_color = horizon
	ciel.ground_horizon_color = horizon.darkened(0.1)
	ciel.ground_bottom_color = Color(0.35, 0.25, 0.18).lerp(Color(0.03, 0.03, 0.04), nuit)
	ciel.sun_angle_max = 8.0 if Jeu.meteo == "sec" else 30.0  # soleil voilé par la poussière
	env.fog_light_color = (_p.brume as Color).lerp(Color(0.04, 0.05, 0.08), nuit).lerp(Color(0.9, 0.55, 0.35), crepuscule * 0.35)
	env.fog_density = _p.densite * (0.7 if nuit > 0.5 else 1.0)
	env.ambient_light_energy = 1.0 + nuit * 1.2   # la nuit, le ciel est sombre : on compense pour garder une lecture
	env.tonemap_exposure = 1.0 + nuit * 0.9
	lune.light_energy = nuit * 0.45
	_lampes_proches(delta, nuit)
	# lampadaires et fenêtres la nuit, chaussée mouillée sous la pluie
	RenderingServer.global_shader_parameter_set("nuit", nuit)
	for l in lampes:
		l.emission_energy_multiplier = 0.05 + nuit * 6.0
	var veut_pluie := 1.0 if Jeu.meteo == "pluie" else 0.0
	_humidite = move_toward(_humidite, veut_pluie, delta * (0.08 if veut_pluie > 0.5 else 0.02))
	RenderingServer.global_shader_parameter_set("humidite", _humidite)
	if pluie: pluie.emitting = Jeu.meteo == "pluie"
	if camera:
		camera.far = Jeu.q("lointain")
		if pluie: pluie.global_position = camera.global_position + Vector3(0, 18, 0)


## Les lampadaires les plus proches de la caméra deviennent de vraies lumières (les autres ne font que briller).
func _lampes_proches(delta: float, nuit: float) -> void:
	_t_lumieres -= delta
	if _t_lumieres > 0.0 or flux == null or camera == null: return
	_t_lumieres = 0.4
	var n := 4 if Jeu.qualite == "basse" else 8
	var cam := camera.global_position
	var proches: Array = []
	for p in flux.lampes():
		var d := p.distance_squared_to(cam)
		if d < 120.0 * 120.0: proches.append([d, p])
	proches.sort_custom(func(a, b): return a[0] < b[0])
	for k in _lumieres.size():
		var o := _lumieres[k]
		if k < n and k < proches.size() and nuit > 0.2:
			o.global_position = proches[k][1] + Vector3(0, -0.3, 0)
			o.light_energy = nuit * 2.2
			o.visible = true
		else:
			o.visible = false
