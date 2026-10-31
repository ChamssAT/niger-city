class_name HUD
extends CanvasLayer
## Interface façon GTA : mini-carte orientée (vraie carte de Niamey), quartier, vitesse, heure, météo, performances.

var joueur: Joueur
var camera_rig: CameraSuivi
var flux: FluxTuiles
var police: Police   # gestionnaire de la PMF
var _reticule: Control
var _vie: Control
var _armes: Label
var _etoiles: Label
var _argent: Label
var _annonce: Label
var _message: Label
var _t_message := 0.0
var _carte: Texture2D
var _carte_info: Dictionary
var _mini: Control
var _zone: Label
var _vitesse: Label
var _heure: Label
var _perf: Label
var _aide: Label
var _pause: PanelContainer
var _dernier_quartier := ""
var _t_zone := 0.0


func _ready() -> void:
	_carte_info = Jeu.monde.get("carte", {})
	if _carte_info: _carte = load("res://donnees/" + _carte_info.fichier)
	var fonte := SystemFont.new()
	fonte.font_names = PackedStringArray(["Bebas Neue", "Oswald", "Impact", "DejaVu Sans"])
	_mini = Control.new()
	_mini.custom_minimum_size = Vector2(280, 180)
	_mini.anchor_top = 1.0
	_mini.anchor_bottom = 1.0
	_mini.offset_left = 24
	_mini.offset_top = -204
	_mini.offset_right = 304
	_mini.offset_bottom = -24
	_mini.clip_contents = true
	_mini.draw.connect(_dessiner_mini)
	add_child(_mini)
	_zone = _label(40, Control.PRESET_BOTTOM_RIGHT, fonte)
	_zone.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_zone.offset_left = -600
	_zone.offset_top = -120
	_zone.offset_right = -28
	_zone.offset_bottom = -24
	_vitesse = _label(34, Control.PRESET_BOTTOM_RIGHT, fonte)
	_vitesse.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_vitesse.offset_left = -300
	_vitesse.offset_top = -190
	_vitesse.offset_right = -28
	_vitesse.offset_bottom = -120
	_heure = _label(30, Control.PRESET_TOP_RIGHT, fonte)
	_heure.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_heure.offset_left = -400
	_heure.offset_top = 16
	_heure.offset_right = -24
	_heure.offset_bottom = 90
	_perf = _label(14, Control.PRESET_TOP_LEFT, null)
	_perf.offset_left = 16
	_perf.offset_top = 12
	_perf.modulate = Color(0.7, 1.0, 0.7)
	_aide = _label(16, Control.PRESET_TOP_LEFT, null)
	_aide.offset_left = 16
	_aide.offset_top = 40
	_aide.text = "ZQSD : se déplacer · E : monter/descendre · Maj : courir · Espace : sauter / frein à main · H : klaxon\nClic droit : viser · Clic gauche : tirer · R : recharger · 1/2/3 ou molette : armes\nC : caméra · O : météo · K : accélérer le temps · I : performances · Échap : menu"
	get_tree().create_timer(12.0).timeout.connect(func(): _aide.visible = false)
	_creer_pause(fonte)
	var police_hud := fonte
	_argent = _label(30, Control.PRESET_TOP_RIGHT, police_hud)
	_argent.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_argent.offset_left = -400
	_argent.offset_top = 92
	_argent.offset_right = -24
	_argent.offset_bottom = 130
	_argent.add_theme_color_override("font_color", Color(0.55, 0.9, 0.5))
	_etoiles = _label(30, Control.PRESET_TOP_RIGHT, null)
	_etoiles.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_etoiles.offset_left = -400
	_etoiles.offset_top = 128
	_etoiles.offset_right = -24
	_etoiles.offset_bottom = 170
	_armes = _label(22, Control.PRESET_TOP_RIGHT, police_hud)
	_armes.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_armes.offset_left = -400
	_armes.offset_top = 170
	_armes.offset_right = -24
	_armes.offset_bottom = 200
	_annonce = _label(84, Control.PRESET_CENTER, police_hud)
	_annonce.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_annonce.offset_left = -600
	_annonce.offset_right = 600
	_annonce.offset_top = -160
	_annonce.offset_bottom = -40
	_annonce.visible = false
	_message = _label(20, Control.PRESET_CENTER_BOTTOM, null)
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.offset_left = -500
	_message.offset_right = 500
	_message.offset_top = -110
	_message.offset_bottom = -70
	_reticule = Control.new()
	_reticule.set_anchors_preset(Control.PRESET_FULL_RECT)
	_reticule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reticule.draw.connect(_dessiner_reticule)
	add_child(_reticule)
	_vie = Control.new()
	_vie.anchor_top = 1.0
	_vie.anchor_bottom = 1.0
	_vie.offset_left = 24
	_vie.offset_top = -18
	_vie.offset_right = 304
	_vie.offset_bottom = -8
	_vie.draw.connect(_dessiner_vie)
	add_child(_vie)
	move_child(_pause, -1)


func _label(taille: int, preset: int, police: Font) -> Label:
	var l := Label.new()
	l.set_anchors_preset(preset)
	l.add_theme_font_size_override("font_size", taille)
	if police: l.add_theme_font_override("font", police)
	l.add_theme_color_override("font_outline_color", Color.BLACK)
	l.add_theme_constant_override("outline_size", 6)
	add_child(l)
	return l


func _process(delta: float) -> void:
	if joueur == null: return
	var v := joueur.vehicule
	var pos := (v.global_position if v else joueur.global_position)
	var q := Jeu.quartier(pos)
	if q != _dernier_quartier:
		_dernier_quartier = q
		_t_zone = 5.0
	_t_zone -= delta
	_zone.text = q + ("\n" + Voiture.MODELES[v.modele].nom if v else "")
	_zone.modulate.a = clampf(_t_zone, 0.0, 1.0)
	_vitesse.visible = v != null
	if v: _vitesse.text = "%d km/h" % roundi(absf(v.vitesse) * 3.6)
	var h := int(Jeu.heure)
	var m := int(fmod(Jeu.heure, 1.0) * 60.0)
	_heure.text = "%02d:%02d\n%s" % [h, m, {"sec": "Saison sèche", "harmattan": "Harmattan", "pluie": "Pluie"}[Jeu.meteo]]
	if _perf.visible:
		_perf.text = "%d FPS · %d appels · %dk triangles · %d tuiles · qualité %s · %s" % [
			Engine.get_frames_per_second(),
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME) / 1000,
			flux.nb_tuiles() if flux else 0, Jeu.qualite, RenderingServer.get_current_rendering_method()]
	_mini.queue_redraw()
	_argent.text = "%s FCFA" % _milliers(Jeu.argent)
	var n := police.etoiles if police else 0
	var cligne := n > 0 and fmod(Time.get_ticks_msec() / 400.0, 2.0) < 1.0
	_etoiles.text = "★".repeat(n) + "☆".repeat(5 - n)
	_etoiles.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2) if cligne else Color.WHITE)
	if v or joueur.arme == "":
		_armes.text = "" if v else "Mains nues"
	else:
		var mun: Array = joueur.munitions[joueur.arme]
		_armes.text = "%s   %d / %d" % [Armes.ARMES[joueur.arme].nom, mun[0], mun[1]]
	_t_message -= delta
	_message.modulate.a = clampf(_t_message, 0.0, 1.0)
	_reticule.queue_redraw()
	_vie.queue_redraw()


func annonce(texte: String, couleur: Color) -> void:
	_annonce.text = texte
	_annonce.add_theme_color_override("font_color", couleur)
	_annonce.visible = true
	get_tree().create_timer(3.5).timeout.connect(func(): _annonce.visible = false)


func message(texte: String) -> void:
	_message.text = texte
	_t_message = 5.0


func _milliers(n: int) -> String:
	var s := str(n)
	var res := ""
	while s.length() > 3:
		res = " " + s.right(3) + res
		s = s.left(s.length() - 3)
	return s + res


func _dessiner_reticule() -> void:
	if joueur == null or joueur.vehicule or joueur.arme == "" or joueur.sante <= 0.0: return
	var c := _reticule.size / 2.0
	var e := 6.0 if joueur.vise else 14.0
	var col := Color(1, 1, 1, 0.9)
	for d in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
		_reticule.draw_line(c + d * e, c + d * (e + 8.0), Color.BLACK, 3.0)
		_reticule.draw_line(c + d * e, c + d * (e + 8.0), col, 1.5)
	_reticule.draw_circle(c, 1.5, col)


func _dessiner_vie() -> void:
	if joueur == null: return
	var t := _vie.size
	_vie.draw_rect(Rect2(Vector2.ZERO, t), Color(0, 0, 0, 0.6))
	var demi := t.x / 2.0 - 2.0
	_vie.draw_rect(Rect2(Vector2(1, 1), Vector2(demi * joueur.sante / 100.0, t.y - 2)), Color(0.35, 0.75, 0.3) if joueur.sante > 30 else Color(0.85, 0.15, 0.1))
	_vie.draw_rect(Rect2(Vector2(demi + 3, 1), Vector2(demi * joueur.gilet / 100.0, t.y - 2)), Color(0.3, 0.55, 0.9))


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("infos"): _perf.visible = not _perf.visible
	elif event.is_action_pressed("pause"): basculer_pause()


func _dessiner_mini() -> void:
	var taille := _mini.size
	_mini.draw_rect(Rect2(Vector2.ZERO, taille), Color(0.78, 0.64, 0.46))
	if _carte == null or joueur == null: return
	var v := joueur.vehicule
	var pos := (v.global_position if v else joueur.global_position)
	var mpp: float = _carte_info.m_par_px
	var px := Vector2((pos.x - _carte_info.x0) / mpp, (pos.z - _carte_info.z0) / mpp)
	var zoom := 1.6 - clampf(absf(v.vitesse) / 40.0 if v else 0.0, 0.0, 0.8)
	var centre := Vector2(taille.x / 2, taille.y * 0.62)
	var lacet := camera_rig.lacet if camera_rig else 0.0
	# la carte tourne avec la caméra : la direction regardée pointe vers le haut
	_mini.draw_set_transform(centre, PI + lacet, Vector2(zoom, zoom))
	_mini.draw_texture(_carte, -px)
	_mini.draw_set_transform(centre, 0.0, Vector2.ONE)
	var cap := (atan2(v.global_transform.basis.z.x, v.global_transform.basis.z.z) if v else joueur.corps.rotation.y)
	var ang := lacet - cap
	var f := Vector2(sin(ang), -cos(ang))
	var d := Vector2(-f.y, f.x)
	var fleche := PackedVector2Array([f * 9, -f * 6 + d * 6, -f * 3, -f * 6 - d * 6])
	_mini.draw_colored_polygon(fleche, Color.WHITE)
	_mini.draw_polyline(fleche + PackedVector2Array([f * 9]), Color.BLACK, 1.5)
	_mini.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_mini.draw_rect(Rect2(Vector2.ZERO, taille), Color(0, 0, 0, 0.7), false, 3.0)


# ------------------------------------------------------------------ menu pause
func _creer_pause(fonte: Font) -> void:
	_pause = PanelContainer.new()
	_pause.set_anchors_preset(Control.PRESET_CENTER)
	_pause.offset_left = -220
	_pause.offset_right = 220
	_pause.offset_top = -230
	_pause.offset_bottom = 230
	_pause.visible = false
	_pause.process_mode = Node.PROCESS_MODE_ALWAYS
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	_pause.add_child(box)
	var titre := Label.new()
	titre.text = "PAUSE"
	titre.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	titre.add_theme_font_override("font", fonte)
	titre.add_theme_font_size_override("font_size", 56)
	box.add_child(titre)
	var ajouter := func(texte: String, f: Callable) -> void:
		var b := Button.new()
		b.text = texte
		b.custom_minimum_size = Vector2(0, 42)
		b.pressed.connect(f)
		box.add_child(b)
	ajouter.call("Reprendre", basculer_pause)
	for nom in ["basse", "moyenne", "haute", "ultra"]:
		ajouter.call("Qualité : " + nom, func(): Jeu.changer_qualite(nom))
	ajouter.call("Météo suivante", Jeu.meteo_suivante)
	ajouter.call("Quitter", func(): get_tree().quit())
	add_child(_pause)


func basculer_pause() -> void:
	_pause.visible = not _pause.visible
	get_tree().paused = _pause.visible
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if _pause.visible else Input.MOUSE_MODE_CAPTURED
