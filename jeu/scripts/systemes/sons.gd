class_name Sons
extends RefCounted
## Sons générés par calcul (aucun fichier à télécharger) : tirs, sirène, klaxon, impacts.
## À remplacer plus tard par de vrais enregistrements.

const FREQ := 22050
static var _cache := {}


static func flux(nom: String) -> AudioStreamWAV:
	if _cache.has(nom): return _cache[nom]
	var echantillons := PackedFloat32Array()
	var boucle := false
	match nom:
		"pistolet": echantillons = _detonation(0.35, 900.0, 0.06)
		"fusil": echantillons = _detonation(0.28, 1400.0, 0.04)
		"impact": echantillons = _detonation(0.08, 3000.0, 0.02, 0.35)
		"vide": echantillons = _clic()
		"sirene":
			boucle = true
			for k in FREQ * 2:
				var t := float(k) / FREQ
				var f := 700.0 if fmod(t, 1.0) < 0.5 else 940.0      # sirène deux tons
				echantillons.append(sin(TAU * f * t) * 0.35 + sin(TAU * f * 2.0 * t) * 0.1)
		"klaxon":
			for k in int(FREQ * 0.45):
				var t := float(k) / FREQ
				var env := minf(1.0, t * 40.0) * minf(1.0, (0.45 - t) * 30.0)
				echantillons.append((signf(sin(TAU * 392.0 * t)) * 0.5 + signf(sin(TAU * 494.0 * t)) * 0.5) * 0.25 * env)
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = FREQ
	w.stereo = false
	var octets := PackedByteArray()
	octets.resize(echantillons.size() * 2)
	for k in echantillons.size():
		octets.encode_s16(k * 2, int(clampf(echantillons[k], -1.0, 1.0) * 32000.0))
	w.data = octets
	if boucle:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_end = echantillons.size()
	_cache[nom] = w
	return w


static func _detonation(duree: float, coupure: float, attaque: float, volume := 1.0) -> PackedFloat32Array:
	var res := PackedFloat32Array()
	var filtre := 0.0
	var k_filtre := clampf(coupure / FREQ * TAU, 0.0, 1.0)
	for k in int(FREQ * duree):
		var t := float(k) / FREQ
		var bruit := randf() * 2.0 - 1.0
		filtre += (bruit - filtre) * k_filtre
		var env := exp(-t / attaque) * 0.9 + exp(-t / (duree * 0.35)) * 0.25
		var grave := sin(TAU * 70.0 * t) * exp(-t / 0.05) * 0.6
		res.append((filtre * 1.6 + grave) * env * volume)
	return res


static func _clic() -> PackedFloat32Array:
	var res := PackedFloat32Array()
	for k in int(FREQ * 0.05):
		res.append((randf() * 2.0 - 1.0) * exp(-float(k) / FREQ / 0.006) * 0.4)
	return res


## Joue un son ponctuel en 3D à une position.
static func jouer(parent: Node, nom: String, pos: Vector3, volume_db := 0.0) -> void:
	var p := AudioStreamPlayer3D.new()
	p.stream = flux(nom)
	p.volume_db = volume_db
	p.unit_size = 12.0
	p.max_distance = 400.0
	p.pitch_scale = randf_range(0.93, 1.07)
	parent.add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()
