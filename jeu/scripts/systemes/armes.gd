class_name Armes
extends RefCounted
## Caractéristiques des armes et tir instantané (rayon) partagé par le joueur et la police.

const ARMES := {
	"": {"nom": "Mains nues"},
	"pistolet": {"nom": "Pistolet", "degats": 34.0, "cadence": 0.28, "chargeur": 12, "recharge": 1.3, "portee": 70.0, "dispersion": 0.012, "auto": false, "son": "pistolet"},
	"fusil": {"nom": "Fusil d'assaut", "degats": 26.0, "cadence": 0.1, "chargeur": 30, "recharge": 2.3, "portee": 140.0, "dispersion": 0.028, "auto": true, "son": "fusil"},
}
const ORDRE := ["", "pistolet", "fusil"]


## Tire un rayon depuis « origine » vers « direction ». Applique les dégâts à ce qui est touché
## (méthode « recevoir_degats » si elle existe) et crée l'effet d'impact. Renvoie le résultat de la requête.
static func tirer(monde: World3D, scene: Node, tireur: Node, origine: Vector3, direction: Vector3, type: String, exclus: Array[RID] = []) -> Dictionary:
	var A: Dictionary = ARMES[type]
	var d: Vector3 = (direction + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * float(A.dispersion)).normalized()
	var q := PhysicsRayQueryParameters3D.create(origine, origine + d * A.portee)
	q.collision_mask = Jeu.C_MONDE | Jeu.C_JOUEUR | Jeu.C_PNJ | Jeu.C_VEHICULE
	q.exclude = exclus
	var r := monde.direct_space_state.intersect_ray(q)
	Sons.jouer(scene, A.son, origine, 2.0)
	_eclair(scene, origine + d * 0.6)
	if r.is_empty(): return r
	var cible: Object = r.collider
	if cible and cible.has_method("recevoir_degats"):
		cible.recevoir_degats(A.degats, d, tireur)
	else:
		_impact(scene, r.position, r.normal)
	return r


static func _eclair(scene: Node, pos: Vector3) -> void:
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.75, 0.4)
	l.light_energy = 3.0
	l.omni_range = 6.0
	scene.add_child(l)
	l.global_position = pos
	scene.get_tree().create_timer(0.05).timeout.connect(l.queue_free)


static func _impact(scene: Node, pos: Vector3, normale: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.emitting = true
	p.one_shot = true
	p.amount = 10
	p.lifetime = 0.6
	p.explosiveness = 1.0
	p.direction = normale
	p.spread = 35.0
	p.initial_velocity_min = 1.5
	p.initial_velocity_max = 4.0
	p.gravity = Vector3(0, -6, 0)
	p.scale_amount_min = 0.04
	p.scale_amount_max = 0.09
	var m := BoxMesh.new()
	m.size = Vector3.ONE
	var mt := StandardMaterial3D.new()
	mt.albedo_color = Color(0.55, 0.38, 0.25)   # poussière de banco / latérite
	m.material = mt
	p.mesh = m
	scene.add_child(p)
	p.global_position = pos + normale * 0.05
	Sons.jouer(scene, "impact", pos, -6.0)
	scene.get_tree().create_timer(1.0).timeout.connect(p.queue_free)
