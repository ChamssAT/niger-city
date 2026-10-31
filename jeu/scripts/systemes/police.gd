class_name Police
extends Node3D
## Niveau de recherche (étoiles) et réponse de la PMF – Police Métropolitaine du Fleuve (police fictive).
## 1 étoile : des agents à pied viennent arrêter le joueur. 2+ : voitures de police et tirs. Perdre la police
## de vue fait baisser les étoiles.

signal arrestation
signal etoiles_changees(n: int)

const AGENTS := [0, 2, 4, 6, 8, 10]
const VOITURES := [0, 0, 1, 2, 3, 4]

var joueur: Joueur
var foule: Foule
var circulation: Circulation
var etoiles := 0
var policiers: Array[Policier] = []
var voitures: Array[Voiture] = []
var _agression := false      # le joueur a tiré sur la police : feu à volonté
var _hors_vue := 0.0
var _t := 0.0
var _arret := 0.0
var _sirene: AudioStreamPlayer


func _ready() -> void:
	_sirene = AudioStreamPlayer.new()
	_sirene.stream = Sons.flux("sirene")
	_sirene.volume_db = -14.0
	add_child(_sirene)


func crime(gravite: int, _pos: Vector3) -> void:
	_fixer(maxi(etoiles, mini(5, etoiles + gravite)))
	_hors_vue = 0.0


func agression_policier() -> void:
	_agression = true
	crime(1, joueur.global_position)
	if etoiles < 3: _fixer(3)


func feu_autorise() -> bool:
	return _agression or etoiles >= 2 or (joueur.vise and etoiles >= 1)


func _fixer(n: int) -> void:
	if n == etoiles: return
	etoiles = n
	if etoiles == 0:
		_agression = false
	etoiles_changees.emit(etoiles)


func _physics_process(delta: float) -> void:
	if joueur == null: return
	var centre := joueur.vehicule.global_position if joueur.vehicule else joueur.global_position
	# nettoyage
	for k in range(policiers.size() - 1, -1, -1):
		var p := policiers[k]
		if not is_instance_valid(p) or (p.etat == Pnj.Etat.MORT and p.temps_mort > 40.0) or p.global_position.distance_to(centre) > 220.0:
			if is_instance_valid(p): p.queue_free()
			policiers.remove_at(k)
	for k in range(voitures.size() - 1, -1, -1):
		var v := voitures[k]
		if not is_instance_valid(v) or (etoiles == 0 and v.global_position.distance_to(centre) > 150.0):
			if is_instance_valid(v):
				circulation.retirer(v)
				v.queue_free()
			voitures.remove_at(k)
	_sirene.stream_paused = etoiles == 0
	if etoiles > 0 and not _sirene.playing: _sirene.play()
	if etoiles == 0: return
	_t -= delta
	if _t <= 0.0:
		_t = 1.5
		_renforts(centre)
	# perdre la police de vue
	var proche := INF
	for p in policiers:
		if p.etat != Pnj.Etat.MORT: proche = minf(proche, p.global_position.distance_to(centre))
	for v in voitures:
		proche = minf(proche, v.global_position.distance_to(centre))
	_sirene.volume_db = lerpf(-6.0, -30.0, clampf(proche / 200.0, 0.0, 1.0))
	if proche > 90.0:
		_hors_vue += delta
		if _hors_vue > 12.0:
			_hors_vue = 0.0
			_fixer(etoiles - 1)
	else:
		_hors_vue = maxf(0.0, _hors_vue - delta * 0.5)
	# arrestation : agent tout près, joueur immobile et sans viser
	var immobile := (joueur.velocity.length() < 1.0 and not joueur.vise) if not joueur.vehicule else absf(joueur.vehicule.vitesse) < 1.0
	if proche < 3.5 and immobile and not feu_autorise():
		_arret += delta
		joueur.corps.mains_levees = joueur.vehicule == null
		if _arret > 2.5:
			_arret = 0.0
			arrestation.emit()
	else:
		_arret = 0.0
		joueur.corps.mains_levees = false
	# voitures de police : poursuite directe du joueur
	for v in voitures:
		_poursuivre(v, centre)


func _renforts(centre: Vector3) -> void:
	var limite := 0.5 if Jeu.qualite == "basse" else 1.0
	var vivants := policiers.filter(func(p): return p.etat != Pnj.Etat.MORT).size()
	if vivants < int(AGENTS[etoiles] * limite) + 1:
		var p: Policier = foule.apparaitre(centre, 45.0, 95.0, Policier)
		if p:
			p.joueur = joueur
			p.police = self
			if etoiles >= 3: p.donner_fusil()
			policiers.append(p)
	if voitures.size() < int(VOITURES[etoiles] * limite + 0.5):
		var v := circulation.apparaitre(centre, 110.0, 190.0, "police")
		if v:
			v.est_police = true
			v.ia_active = false
			v.gyrophare(true)
			voitures.append(v)


func _poursuivre(v: Voiture, cible: Vector3) -> void:
	if not is_instance_valid(v) or v.conducteur == joueur: return
	var avant := v.global_transform.basis.z
	var vers := cible - v.global_position
	vers.y = 0.0
	var dist := vers.length()
	var angle := atan2(avant.cross(vers.normalized()).y, avant.dot(vers.normalized()))
	var v_max := clampf(dist * 0.5, 0.0, 30.0) if dist > 9.0 else 0.0
	if absf(angle) > 1.6 and dist < 25.0:   # cible derrière : marche arrière en braquant à l'opposé
		v.commande = {"gaz": 0.0, "frein": 0.7, "direction": -signf(angle), "frein_main": false}
		return
	v.commande.direction = clampf(angle * 2.5, -1.0, 1.0)
	v.commande.gaz = 1.0 if v.vitesse < v_max else 0.0
	v.commande.frein = 1.0 if v.vitesse > v_max + 3.0 or (dist < 9.0 and v.vitesse > 1.0) else 0.0
	v.commande.frein_main = absf(angle) > 0.9 and v.vitesse > 12.0


func lever() -> void:
	_fixer(0)
	_hors_vue = 0.0
	for p in policiers:
		if is_instance_valid(p): p.queue_free()
	policiers.clear()
	for v in voitures:
		if is_instance_valid(v):
			circulation.retirer(v)
			v.queue_free()
	voitures.clear()
