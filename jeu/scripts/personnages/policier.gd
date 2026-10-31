class_name Policier
extends Pnj
## Agent de la PMF (Police Métropolitaine du Fleuve, police fictive) : patrouille, poursuit, tente
## d'arrêter le joueur, et riposte s'il est armé et dangereux.

var joueur: Joueur
var police  # gestionnaire (systemes/police.gd)
var _cadence := randf_range(0.5, 1.5)
var _t_vue := 0.0
var _voit_joueur := false


func _init() -> void:
	sante = 90.0


func _ready() -> void:
	corps = CorpsHumain.new()
	corps.construire(CorpsHumain.aleatoire("police"))
	super._ready()
	corps.donner_arme("pistolet")


func _physics_process(delta: float) -> void:
	if etat == Etat.MORT:
		temps_mort += delta
		return
	if police == null or joueur == null or police.etoiles == 0:
		super._physics_process(delta)
		corps.visee = false
		return
	var cible := joueur.vehicule.global_position if joueur.vehicule else joueur.global_position
	var vers := cible - global_position
	vers.y = 0.0
	var dist := vers.length()
	_t_vue -= delta
	if _t_vue <= 0.0:
		_t_vue = 0.3
		_voit_joueur = _vue_degagee(cible)
	var agressif: bool = police.feu_autorise()
	var dir := Vector3.ZERO
	var v := 0.0
	if not agressif:
		# arrestation : s'approche à moins de 2 m, arme pointée
		if dist > 1.8:
			dir = vers / dist
			v = 4.0 if dist > 8.0 else 2.0
	else:
		# combat : garde une distance de tir, se rapproche si la vue est bouchée
		if dist > 25.0 or not _voit_joueur:
			dir = vers / maxf(dist, 0.01)
			v = 5.0
		elif dist < 7.0:
			dir = -vers / maxf(dist, 0.01)
			v = 2.0
	_deplacer(dir, v, delta)
	corps.visee = dist < 40.0
	if corps.visee: corps.rotation.y = lerp_angle(corps.rotation.y, atan2(vers.x, vers.z), minf(1.0, delta * 10.0))
	_cadence -= delta
	if agressif and _voit_joueur and dist < 45.0 and _cadence <= 0.0 and joueur.sante > 0.0:
		_cadence = randf_range(0.7, 1.6)
		var origine := global_position + Vector3(0, 1.5, 0) + vers.normalized() * 0.5
		var vise_pt := cible + Vector3(0, 1.2, 0)
		# précision : baisse avec la distance et si le joueur bouge vite
		var erreur := 0.02 + dist * 0.004 + (joueur.velocity.length() if not joueur.vehicule else absf(joueur.vehicule.vitesse)) * 0.006
		var d := (vise_pt - origine).normalized() + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * erreur
		Armes.tirer(get_world_3d(), get_parent(), self, origine, d.normalized(), corps.arme, [get_rid()])


func _vue_degagee(cible: Vector3) -> bool:
	var q := PhysicsRayQueryParameters3D.create(global_position + Vector3(0, 1.6, 0), cible + Vector3(0, 1.2, 0))
	q.collision_mask = Jeu.C_MONDE
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()


func recevoir_degats(degats: float, dir: Vector3, source: Node) -> void:
	if source is Joueur and police: police.agression_policier()
	super.recevoir_degats(degats, dir, source)
	if etat != Etat.MORT: etat = Etat.MARCHE   # un policier ne fuit pas


func donner_fusil() -> void:
	corps.donner_arme("fusil")
