class_name Foule
extends Node3D
## Fait apparaître des passants autour du joueur sur les bas-côtés des vraies rues, gère panique et accidents.

signal pieton_tue(par: Node, pos: Vector3)

var flux: FluxTuiles
var joueur: Joueur
var vehicules: Array   # référence partagée vers la liste des véhicules de la scène
var pietons: Array[Pnj] = []
var _t := 0.0


func _physics_process(delta: float) -> void:
	if joueur == null: return
	var centre := joueur.vehicule.global_position if joueur.vehicule else joueur.global_position
	_t -= delta
	if _t <= 0.0:
		_t = 0.5
		_entretenir(centre)
	# accidents : un véhicule rapide renverse les passants
	for p in pietons:
		if p.etat == Pnj.Etat.MORT: continue
		for v in vehicules:
			if not is_instance_valid(v): continue
			var vit := absf((v as Voiture).vitesse)
			if vit < 4.5: continue
			var d: Vector3 = p.global_position - v.global_position
			if Vector2(d.x, d.z).length() < 2.3:
				p.mourir(v.conducteur if v.conducteur else v)
				break
			elif Vector2(d.x, d.z).length() < 9.0 and vit > 8.0:
				p.fuir(v.global_position)


func _entretenir(centre: Vector3) -> void:
	var cible: int = Jeu.EFFECTIFS[Jeu.qualite][0]
	for k in range(pietons.size() - 1, -1, -1):
		var p := pietons[k]
		var loin := p.global_position.distance_to(centre) > 170.0
		if loin or (p.etat == Pnj.Etat.MORT and p.temps_mort > 40.0):
			pietons.remove_at(k)
			p.queue_free()
	var essais := 0
	while pietons.size() < cible and essais < 6:
		essais += 1
		apparaitre(centre, 35.0, 130.0)


## Ajoute un passant (ou un policier si « classe » est fournie) sur une voie entre rmin et rmax du centre.
func apparaitre(centre: Vector3, rmin: float, rmax: float, classe: Variant = null) -> Pnj:
	var voies := flux.voies_proches(centre, rmax)
	if voies.is_empty(): return null
	for _essai in 8:
		var v: Array = voies[randi() % voies.size()]
		var pts: PackedVector2Array = v[0]
		var k := randi() % pts.size()
		var d := Vector2(pts[k].x - centre.x, pts[k].y - centre.z).length()
		if d < rmin or d > rmax: continue
		var p: Pnj = classe.new() if classe else Pnj.new()
		p.flux = flux
		add_child(p)
		p.placer(v, k, 1 if randf() < 0.5 else -1, -1.0 if randf() < 0.5 else 1.0)
		p.tue.connect(_sur_mort)
		if not (p is Policier): pietons.append(p)
		return p
	return null


func panique(pos: Vector3, rayon: float) -> void:
	for p in pietons:
		if p.global_position.distance_to(pos) < rayon: p.fuir(pos)


func ejecter_conducteur(v: Voiture) -> void:
	var p := Pnj.new()
	p.flux = flux
	add_child(p)
	p.global_position = v.global_position + v.global_transform.basis.x * 1.8
	p.tue.connect(_sur_mort)
	pietons.append(p)
	p.fuir(v.global_position - v.global_transform.basis.x * 5.0)


func _sur_mort(p: Pnj, par: Node) -> void:
	pieton_tue.emit(par, p.global_position)
