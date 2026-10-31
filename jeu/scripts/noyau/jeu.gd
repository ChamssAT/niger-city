extends Node
## Singleton global « Jeu » : réglages de qualité, actions clavier/manette, carte du monde, heure et météo.

signal qualite_changee(nom: String)
signal meteo_changee(nom: String)

const CHEMIN_REGLAGES := "user://reglages.cfg"
const QUALITES := {
	"basse":   {"rayon": 2, "ombres": false, "echelle": 0.7,  "dist_arbres": 180.0, "dist_props": 120.0, "ssao": false, "lointain": 900.0},
	"moyenne": {"rayon": 3, "ombres": true,  "echelle": 0.85, "dist_arbres": 300.0, "dist_props": 200.0, "ssao": false, "lointain": 1500.0},
	"haute":   {"rayon": 4, "ombres": true,  "echelle": 1.0,  "dist_arbres": 450.0, "dist_props": 300.0, "ssao": true,  "lointain": 2500.0},
	"ultra":   {"rayon": 5, "ombres": true,  "echelle": 1.0,  "dist_arbres": 650.0, "dist_props": 400.0, "ssao": true,  "lointain": 3500.0},
}
const METEOS := ["sec", "harmattan", "pluie"]

var qualite := "moyenne"
var meteo := "harmattan"
var heure := 16.5            # heure de jeu (0-24)
var vitesse_temps := 1.0 / 40.0   # heures de jeu par seconde réelle (1 h = 40 s)
var monde: Dictionary = {}
var tuile := 256.0
var argent := 5000

# couches de collision
const C_MONDE := 1
const C_JOUEUR := 2
const C_PNJ := 4
const C_VEHICULE := 8

# effectifs selon la qualité (piétons, voitures IA)
const EFFECTIFS := {"basse": [10, 5], "moyenne": [22, 9], "haute": [36, 14], "ultra": [55, 20]}


func _ready() -> void:
	_creer_actions()
	_charger_reglages()
	_charger_monde()
	for p in [["humidite", 0.0], ["nuit", 0.0]]:
		RenderingServer.global_shader_parameter_add(p[0], RenderingServer.GLOBAL_VAR_TYPE_FLOAT, p[1])
	# options de ligne de commande : -- --qualite=basse --meteo=pluie --heure=21
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--qualite="): qualite = a.get_slice("=", 1)
		elif a.begins_with("--meteo="): meteo = a.get_slice("=", 1)
		elif a.begins_with("--heure="): heure = a.get_slice("=", 1).to_float()
	if not QUALITES.has(qualite): qualite = "moyenne"


func _process(delta: float) -> void:
	heure = fmod(heure + delta * vitesse_temps, 24.0)


func q(cle: String):
	return QUALITES[qualite][cle]


func changer_qualite(nom: String) -> void:
	if not QUALITES.has(nom): return
	qualite = nom
	_sauver_reglages()
	qualite_changee.emit(nom)


func changer_meteo(nom: String) -> void:
	meteo = nom
	meteo_changee.emit(nom)


func meteo_suivante() -> void:
	changer_meteo(METEOS[(METEOS.find(meteo) + 1) % METEOS.size()])


## Nom du quartier le plus proche (d'après les « place=suburb/neighbourhood » d'OpenStreetMap).
func quartier(pos: Vector3) -> String:
	var meilleur := "Niamey"
	var d_min := INF
	for q_ in monde.get("quartiers", []):
		var d: float = Vector2(q_.x - pos.x, q_.z - pos.z).length_squared()
		if d < d_min:
			d_min = d
			meilleur = q_.nom
	return meilleur if d_min < 1800.0 * 1800.0 else "Brousse"


func _charger_monde() -> void:
	var f := FileAccess.open("res://donnees/monde.json", FileAccess.READ)
	if f == null:
		push_error("donnees/monde.json introuvable : lancer outils/osm_vers_jeu.py")
		return
	monde = JSON.parse_string(f.get_as_text())
	tuile = monde.get("tuile", 256.0)


func _creer_actions() -> void:
	var touches := {
		"avancer": [KEY_W, KEY_UP], "reculer": [KEY_S, KEY_DOWN],
		"gauche": [KEY_A, KEY_LEFT], "droite": [KEY_D, KEY_RIGHT],
		"sauter": [KEY_SPACE], "courir": [KEY_SHIFT], "entrer": [KEY_E, KEY_F],
		"klaxon": [KEY_H], "camera": [KEY_C], "pause": [KEY_ESCAPE, KEY_P],
		"carte": [KEY_M], "infos": [KEY_I], "meteo": [KEY_O], "accelerer_temps": [KEY_K],
		"accelerer": [KEY_W, KEY_UP], "freiner": [KEY_S, KEY_DOWN], "recharger": [KEY_R],
		"arme_0": [KEY_1], "arme_1": [KEY_2], "arme_2": [KEY_3], "arme_suivante": [KEY_TAB],
	}
	var souris := {"tirer": MOUSE_BUTTON_LEFT, "viser": MOUSE_BUTTON_RIGHT, "arme_suivante": MOUSE_BUTTON_WHEEL_UP}
	# manette (PC / consoles) : gâchettes = accélérer/freiner, stick gauche = direction
	var manette := {
		"avancer": [[JOY_AXIS_LEFT_Y, -1.0]], "reculer": [[JOY_AXIS_LEFT_Y, 1.0]],
		"accelerer": [[JOY_AXIS_TRIGGER_RIGHT, 1.0]], "freiner": [[JOY_AXIS_TRIGGER_LEFT, 1.0]],
		"tirer": [[JOY_AXIS_TRIGGER_RIGHT, 1.0]], "viser": [[JOY_AXIS_TRIGGER_LEFT, 1.0]],
		"gauche": [[JOY_AXIS_LEFT_X, -1.0]], "droite": [[JOY_AXIS_LEFT_X, 1.0]],
	}
	var boutons := {"sauter": JOY_BUTTON_A, "entrer": JOY_BUTTON_Y, "klaxon": JOY_BUTTON_LEFT_STICK,
		"camera": JOY_BUTTON_BACK, "pause": JOY_BUTTON_START, "courir": JOY_BUTTON_B,
		"recharger": JOY_BUTTON_X, "arme_suivante": JOY_BUTTON_RIGHT_SHOULDER}
	for action in souris:
		if not touches.has(action): touches[action] = []
	for action in touches:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.25)
		for k in touches[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)
		for m in manette.get(action, []):
			var jm := InputEventJoypadMotion.new()
			jm.axis = m[0]
			jm.axis_value = m[1]
			InputMap.action_add_event(action, jm)
		if souris.has(action):
			var mb := InputEventMouseButton.new()
			mb.button_index = souris[action]
			InputMap.action_add_event(action, mb)
		if boutons.has(action):
			var jb := InputEventJoypadButton.new()
			jb.button_index = boutons[action]
			InputMap.action_add_event(action, jb)


func _charger_reglages() -> void:
	var c := ConfigFile.new()
	if c.load(CHEMIN_REGLAGES) == OK:
		qualite = c.get_value("affichage", "qualite", qualite)
	elif OS.has_feature("mobile") or OS.has_feature("web"):
		qualite = "basse"


func _sauver_reglages() -> void:
	var c := ConfigFile.new()
	c.set_value("affichage", "qualite", qualite)
	c.save(CHEMIN_REGLAGES)
