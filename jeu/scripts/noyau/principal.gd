extends Node3D
## Scène principale : monde (tuiles OSM), ambiance, joueur, véhicules, foule, circulation, police et HUD.
##
## Options de test (après « -- ») : --capture=fichier.png --images=N --aerien --monter --test-conduite
##   --test-combat (donne 3 étoiles et fait apparaître la police) --qualite= --meteo= --heure=

var flux: FluxTuiles
var ambiance: Ambiance
var joueur: Joueur
var camera_rig: CameraSuivi
var hud: HUD
var foule: Foule
var circulation: Circulation
var police: Police
var vehicules: Array[Voiture] = []

var _capture := ""
var _images_avant_capture := 0
var _aerien := false
var _auto_monter := false
var _test_conduite := false
var _test_combat := false
var _t_test := 0.0
var _inclinaison_min := 1.0
var _vmax := 0.0
var _attente_sol := true
var _t_reapparition := -1.0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--capture="): _capture = a.get_slice("=", 1)
		elif a.begins_with("--images="): _images_avant_capture = a.get_slice("=", 1).to_int()
		elif a == "--aerien": _aerien = true
		elif a == "--monter": _auto_monter = true
		elif a == "--test-conduite":
			_auto_monter = true
			_test_conduite = true
		elif a == "--test-combat": _test_combat = true
	var mats := RessourcesMonde.materiaux()
	ambiance = Ambiance.new()
	add_child(ambiance)
	flux = FluxTuiles.new()
	flux.materiaux = mats
	flux.mailles_arbres = RessourcesMonde.arbres()
	flux.maille_poteau = RessourcesMonde.poteau()
	flux.maille_lampadaire = RessourcesMonde.lampadaire()
	ambiance.lampes.append(flux.maille_lampadaire.get_meta("lampe"))
	add_child(flux)
	flux.creer_sol_lointain()

	var ap: Dictionary = Jeu.monde.get("apparition", {"x": 0.0, "z": 60.0})
	joueur = Joueur.new()
	joueur.position = Vector3(ap.x, 0.5, ap.z)
	add_child(joueur)
	joueur.mort_survenue.connect(_sur_mort_joueur)
	joueur.tir_effectue.connect(_sur_tir)
	camera_rig = CameraSuivi.new()
	add_child(camera_rig)
	camera_rig.cible = joueur
	camera_rig.global_position = joueur.position + Vector3(0, 2, 0)
	camera_rig.lacet = ap.get("cap", 0.0)
	if _aerien:
		camera_rig.tangage = -0.75
		camera_rig._loin = true
	joueur.camera_rig = camera_rig
	joueur.corps.rotation.y = ap.get("cap", 0.0)
	ambiance.camera = camera_rig.camera
	ambiance.flux = flux
	flux.cible = joueur

	# véhicules garés le long du trottoir : un taxi blanc, une berline, un 4x4, un faba-faba
	var types := ["taxi", "berline", "4x4", "minibus"]
	var places: Array = ap.get("places", [])
	for k in mini(types.size(), places.size()):
		if _test_conduite and k > 0: break
		var v := Voiture.creer(types[k])
		v.position = Vector3(places[k].x, 0.6, places[k].z)
		v.rotation.y = places[k].cap
		add_child(v)
		vehicules.append(v)

	foule = Foule.new()
	foule.flux = flux
	foule.joueur = joueur
	foule.vehicules = vehicules
	foule.pieton_tue.connect(_sur_pieton_tue)
	add_child(foule)
	circulation = Circulation.new()
	circulation.flux = flux
	circulation.joueur = joueur
	circulation.vehicules = vehicules
	add_child(circulation)
	police = Police.new()
	police.add_to_group("police")
	police.joueur = joueur
	police.foule = foule
	police.circulation = circulation
	police.arrestation.connect(_sur_arrestation)
	add_child(police)
	if _test_conduite:
		foule.process_mode = Node.PROCESS_MODE_DISABLED
		circulation.process_mode = Node.PROCESS_MODE_DISABLED

	hud = HUD.new()
	hud.joueur = joueur
	hud.camera_rig = camera_rig
	hud.flux = flux
	hud.police = police
	hud.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(hud)
	if _capture == "": Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# tout attend que le sol soit chargé
	joueur.set_physics_process(false)
	for n in [foule, circulation, police]: n.set_physics_process(false)
	for v in vehicules: v.freeze = true


func _process(delta: float) -> void:
	if _attente_sol and flux.pret_autour(joueur.global_position):
		_attente_sol = false
		joueur.set_physics_process(true)
		for n in [foule, circulation, police]: n.set_physics_process(true)
		for v in vehicules: v.freeze = false
		if _auto_monter:
			_auto_monter = false
			joueur.global_position = vehicules[0].global_position + Vector3(1.5, 0.2, 0)
			_monter()
			camera_rig.lacet = vehicules[0].rotation.y + 2.5
			camera_rig.tangage = -0.2
		if _test_combat and police.etoiles == 0 and _t_test == 0.0:
			_t_test = 0.001
			police.crime(3, joueur.global_position)
			joueur.changer_arme("fusil")
	var nuit := 1.0 - clampf((sin((Jeu.heure - 6.0) / 12.0 * PI) + 0.08) / 0.3, 0.0, 1.0)
	for v in vehicules:
		if is_instance_valid(v): v.allumer_phares(nuit)
	if _t_reapparition >= 0.0:
		_t_reapparition -= delta
		if _t_reapparition < 0.0: _reapparaitre()
	if _capture != "":
		_images_avant_capture -= 1
		if _images_avant_capture <= 0:
			get_viewport().get_texture().get_image().save_png(_capture)
			print("Capture enregistrée : ", _capture)
			if _test_combat:
				print("COMBAT : étoiles %d, policiers %d, voitures de police %d, passants %d, voitures IA %d, santé joueur %.0f" % [
					police.etoiles, police.policiers.size(), police.voitures.size(), foule.pietons.size(), circulation.ia.size(), joueur.sante])
			get_tree().quit()


func _unhandled_input(event: InputEvent) -> void:
	if joueur.sante <= 0.0: return
	if event.is_action_pressed("entrer"):
		if joueur.vehicule: _descendre()
		else: _monter()
	elif event.is_action_pressed("klaxon") and joueur.vehicule:
		Sons.jouer(self, "klaxon", joueur.vehicule.global_position)
		foule.panique(joueur.vehicule.global_position, 12.0)
	elif event.is_action_pressed("meteo"):
		Jeu.meteo_suivante()
	elif event.is_action_pressed("accelerer_temps"):
		Jeu.vitesse_temps = 1.0 / 40.0 if Jeu.vitesse_temps > 0.1 else 0.5


func _physics_process(delta: float) -> void:
	var v := joueur.vehicule
	if v == null: return
	v.commande.gaz = Input.get_action_strength("accelerer")
	v.commande.frein = Input.get_action_strength("freiner")
	v.commande.direction = Input.get_action_strength("gauche") - Input.get_action_strength("droite")
	v.commande.frein_main = Input.is_action_pressed("sauter")
	if _test_conduite:   # essai automatique : pleine accélération puis virage serré à fond
		_t_test += delta
		v.commande.gaz = 1.0
		v.commande.frein = 0.0
		v.commande.direction = 0.0 if _t_test < 12.0 else (1.0 if fmod(_t_test, 6.0) < 3.0 else -1.0)
		_inclinaison_min = minf(_inclinaison_min, v.global_transform.basis.y.y)
		_vmax = maxf(_vmax, absf(v.vitesse))
		if _t_test > 26.0:
			print("ESSAI : vitesse max %.0f km/h, inclinaison mini (1 = à plat, 0 = sur le flanc) %.2f" % [_vmax * 3.6, _inclinaison_min])
			get_tree().quit()
	joueur.global_position = v.global_position


# ------------------------------------------------------------------ véhicules
func _monter() -> void:
	var meilleur: Voiture = null
	var d_min := 4.0
	for v in vehicules:
		if not is_instance_valid(v): continue
		var d := v.global_position.distance_to(joueur.global_position)
		if d < d_min:
			d_min = d
			meilleur = v
	if meilleur == null: return
	if meilleur.conducteur != null and meilleur.conducteur != joueur:
		# vol de voiture : le conducteur est éjecté et s'enfuit
		circulation.retirer(meilleur)
		vehicules.append(meilleur)
		police.voitures.erase(meilleur)
		foule.ejecter_conducteur(meilleur)
		meilleur.gyrophare(false)
		var temoins := police.policiers.any(func(p): return p.global_position.distance_to(joueur.global_position) < 50.0)
		if meilleur.est_police: police.crime(2, joueur.global_position)
		elif temoins: police.crime(1, joueur.global_position)
	joueur.vehicule = meilleur
	meilleur.conducteur = joueur
	meilleur.ia_active = false
	joueur.visible = false
	for c in joueur.get_children():
		if c is CollisionShape3D: c.disabled = true
	camera_rig.cible = meilleur
	camera_rig.visee = false
	flux.cible = meilleur


func _descendre() -> void:
	var v := joueur.vehicule
	if absf(v.vitesse) > 6.0: return
	v.commande = {"gaz": 0.0, "frein": 0.0, "direction": 0.0, "frein_main": true}
	v.conducteur = null
	joueur.vehicule = null
	joueur.global_position = v.global_position + v.global_transform.basis.x * 1.6 + Vector3.UP * 0.3
	joueur.velocity = Vector3.ZERO
	joueur.visible = true
	for c in joueur.get_children():
		if c is CollisionShape3D: c.disabled = false
	camera_rig.cible = joueur
	flux.cible = joueur


# ------------------------------------------------------------------ crimes, mort, arrestation
func _sur_tir(pos: Vector3) -> void:
	foule.panique(pos, 60.0)
	var temoin := police.policiers.any(func(p): return p.global_position.distance_to(pos) < 70.0)
	if temoin or police.etoiles > 0: police.crime(1, pos)


func _sur_pieton_tue(par: Node, pos: Vector3) -> void:
	if par == joueur: police.crime(1, pos)


func _sur_mort_joueur() -> void:
	hud.annonce("HOSPITALISÉ", Color(0.85, 0.1, 0.1))
	_t_reapparition = 4.0
	_mode_reapparition = "hopital"


func _sur_arrestation() -> void:
	hud.annonce("ARRÊTÉ PAR LA PMF", Color(0.3, 0.55, 1.0))
	if joueur.vehicule: _descendre()
	joueur.set_physics_process(false)
	_t_reapparition = 3.5
	_mode_reapparition = "commissariat"


var _mode_reapparition := "hopital"


func _reapparaitre() -> void:
	var type := "hospital" if _mode_reapparition == "hopital" else "police"
	var meilleur := Vector3.ZERO
	var d_min := INF
	for l in Jeu.monde.get("lieux", []):
		if l.type == type:
			var p := Vector3(l.x, 0, l.z)
			var d := p.distance_to(joueur.global_position)
			if d < d_min:
				d_min = d
				meilleur = p
	var amende := 3000 if type == "hospital" else 5000
	Jeu.argent = maxi(0, Jeu.argent - amende)
	if type == "police":   # confiscation des munitions
		for a in joueur.munitions: joueur.munitions[a] = [0, 0]
		joueur.munitions["pistolet"] = [12, 24]
	police.lever()
	if joueur.vehicule: _descendre()
	joueur.ressusciter(meilleur + Vector3(0, 1.0, 0))
	joueur.set_physics_process(false)
	_attente_sol = true
	hud.message("%s · −%d FCFA" % ["Soins à l'hôpital" if type == "hospital" else "Amende et confiscation des armes", amende])
