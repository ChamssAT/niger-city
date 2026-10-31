class_name RessourcesMonde
extends RefCounted
## Matériaux partagés et maillages des objets répétés (arbres, poteaux, lampadaires).

static func materiaux() -> Dictionary:
	var t := func(nom: String) -> Texture2D: return load("res://textures/%s.jpg" % nom)
	var m := {}
	var bati := ShaderMaterial.new()
	bati.shader = load("res://shaders/batiment.gdshader")
	bati.set_shader_parameter("tex_mur", t.call("clay_plaster_diff"))
	bati.set_shader_parameter("nor_mur", t.call("clay_plaster_nor"))
	m.bati = bati
	var route := ShaderMaterial.new()
	route.shader = load("res://shaders/route.gdshader")
	route.set_shader_parameter("tex_goudron", t.call("asphalt_02_diff"))
	route.set_shader_parameter("nor_goudron", t.call("asphalt_02_nor"))
	route.set_shader_parameter("tex_laterite", t.call("brown_mud_dry_diff"))
	route.set_shader_parameter("tex_sable", t.call("aerial_sand_diff"))
	route.render_priority = 1
	m.route = route
	var sol := ShaderMaterial.new()
	sol.shader = load("res://shaders/sol.gdshader")
	sol.set_shader_parameter("tex_sable", t.call("aerial_sand_diff"))
	sol.set_shader_parameter("nor_sable", t.call("aerial_sand_nor"))
	sol.set_shader_parameter("tex_laterite", t.call("brown_mud_dry_diff"))
	m.sol = sol
	var eau := ShaderMaterial.new()
	eau.shader = load("res://shaders/eau.gdshader")
	m.eau = eau
	var beton := StandardMaterial3D.new()
	beton.albedo_texture = t.call("concrete_floor_02_diff")
	beton.normal_enabled = true
	beton.normal_texture = t.call("concrete_floor_02_nor")
	beton.uv1_triplanar = true
	beton.uv1_world_triplanar = true
	beton.uv1_scale = Vector3.ONE * 0.25
	beton.vertex_color_use_as_albedo = true
	beton.roughness = 0.9
	m.beton = beton
	var paille := StandardMaterial3D.new()
	paille.albedo_texture = t.call("brown_mud_dry_diff")
	paille.albedo_color = Color(1.5, 1.25, 0.8)
	paille.uv1_triplanar = true
	paille.uv1_world_triplanar = true
	paille.uv1_scale = Vector3.ONE * 0.6
	paille.roughness = 1.0
	m.paille = paille
	var cable := StandardMaterial3D.new()
	cable.albedo_color = Color(0.04, 0.04, 0.04)
	cable.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cable.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.cable = cable
	return m


## Maillage assemblé à partir de primitives colorées (couleur par sommet).
static func _assembler(pieces: Array, mat: Material) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for p in pieces:
		var maille: Mesh = p[0]
		var xf: Transform3D = p[1]
		var col: Color = p[2]
		var arr := maille.surface_get_arrays(0)
		var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var n: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
		var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
		var liste := idx if not idx.is_empty() else PackedInt32Array(range(v.size()))
		for k in liste:
			st.set_color(col)
			st.set_normal((xf.basis * n[k]).normalized())
			st.add_vertex(xf * v[k])
	var m := st.commit()
	m.surface_set_material(0, mat)
	return m


static func _feuillage() -> StandardMaterial3D:
	var f := StandardMaterial3D.new()
	f.vertex_color_use_as_albedo = true
	f.roughness = 0.88
	f.albedo_texture = load("res://textures/aerial_sand_diff.jpg")
	f.uv1_triplanar = true
	f.uv1_world_triplanar = true
	f.uv1_scale = Vector3.ONE * 1.7
	f.albedo_color = Color(1.4, 1.6, 1.2)
	return f


static func arbres() -> Dictionary:
	var feuil := _feuillage()
	var tronc := Color(0.33, 0.26, 0.2)
	var boule := func(r: float) -> SphereMesh:
		var s := SphereMesh.new()
		s.radius = r
		s.height = r * 1.6
		s.radial_segments = 10
		s.rings = 6
		return s
	var cyl := func(r1: float, r2: float, h: float) -> CylinderMesh:
		var c := CylinderMesh.new()
		c.top_radius = r1
		c.bottom_radius = r2
		c.height = h
		c.radial_segments = 7
		c.rings = 1
		return c
	var at := func(x: float, y: float, z: float) -> Transform3D: return Transform3D(Basis(), Vector3(x, y, z))
	var res := {}
	# 0 : neem (azadirachta), le grand arbre d'ombre des rues de Niamey — couronne dense et sombre
	var p0 := [[cyl.call(0.22, 0.32, 4.2), at.call(0, 2.1, 0), tronc]]
	var verts := [Color(0.2, 0.33, 0.13), Color(0.24, 0.38, 0.15), Color(0.18, 0.3, 0.12)]
	var offs := [Vector3(0, 5.2, 0), Vector3(1.6, 4.6, 0.6), Vector3(-1.4, 4.8, -0.8), Vector3(0.4, 4.4, -1.7), Vector3(-0.6, 5.9, 1.2), Vector3(1.2, 5.6, -1.0)]
	for k in offs.size():
		p0.append([boule.call(2.3 - (k % 3) * 0.3), at.call(offs[k].x, offs[k].y, offs[k].z), verts[k % 3]])
	res[0] = _assembler(p0, feuil)
	# 1 : acacia épineux, couronne en parasol
	var p1 := [[cyl.call(0.1, 0.18, 3.0), at.call(0, 1.5, 0), tronc], [cyl.call(0.08, 0.12, 1.6), Transform3D(Basis(Vector3.FORWARD, 0.6), Vector3(0.5, 3.0, 0)), tronc]]
	for k in 4:
		var a := k * TAU / 4.0
		p1.append([boule.call(1.8), Transform3D(Basis().scaled(Vector3(1.3, 0.35, 1.3)), Vector3(cos(a) * 1.4, 3.6, sin(a) * 1.4)), Color(0.36, 0.42, 0.18)])
	res[1] = _assembler(p1, feuil)
	# 2 : baobab, tronc massif et branches nues
	var p2 := [[cyl.call(0.9, 1.4, 6.0), at.call(0, 3.0, 0), Color(0.55, 0.5, 0.45)]]
	for k in 5:
		var a := k * TAU / 5.0
		p2.append([cyl.call(0.15, 0.3, 3.0), Transform3D(Basis(Vector3(sin(a), 0, -cos(a)), 0.8), Vector3(cos(a) * 1.0, 6.8, sin(a) * 1.0)), Color(0.55, 0.5, 0.45)])
		p2.append([boule.call(1.1), at.call(cos(a) * 2.2, 8.0, sin(a) * 2.2), Color(0.38, 0.46, 0.2)])
	res[2] = _assembler(p2, feuil)
	# 3 : rônier / palmier doum
	var p3 := [[cyl.call(0.2, 0.28, 10.0), at.call(0, 5.0, 0), Color(0.42, 0.37, 0.3)]]
	for k in 9:
		var a := k * TAU / 9.0
		p3.append([boule.call(0.6), Transform3D(Basis(Vector3(sin(a), 0, -cos(a)), 1.1).scaled(Vector3(0.6, 4.2, 0.25)), Vector3(cos(a) * 1.6, 9.7, sin(a) * 1.6)), Color(0.3, 0.42, 0.17)])
	res[3] = _assembler(p3, feuil)
	return res


static func poteau() -> ArrayMesh:
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.9
	var c := CylinderMesh.new()
	c.top_radius = 0.09
	c.bottom_radius = 0.13
	c.height = 8.0
	c.radial_segments = 6
	var b := BoxMesh.new()
	b.size = Vector3(1.6, 0.1, 0.1)
	var iso := CylinderMesh.new()
	iso.top_radius = 0.05
	iso.bottom_radius = 0.06
	iso.height = 0.18
	iso.radial_segments = 6
	var bois := Color(0.38, 0.3, 0.22)
	var pieces := [[c, Transform3D(Basis(), Vector3(0, 4.0, 0)), bois], [b, Transform3D(Basis(Vector3.UP, PI / 2), Vector3(0, 7.5, 0)), bois]]
	for z in [-0.5, 0.0, 0.5]:
		pieces.append([iso, Transform3D(Basis(), Vector3(0, 7.65, z)), Color(0.85, 0.85, 0.8)])
	return _assembler(pieces, mat)


static func lampadaire() -> ArrayMesh:
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.metallic = 0.6
	mat.roughness = 0.4
	var mat_lampe := StandardMaterial3D.new()
	mat_lampe.emission_enabled = true
	mat_lampe.emission = Color(1.0, 0.85, 0.6)
	mat_lampe.albedo_color = Color(0.9, 0.9, 0.85)
	var mat_lampe_ref := mat_lampe
	var c := CylinderMesh.new()
	c.top_radius = 0.07
	c.bottom_radius = 0.12
	c.height = 9.0
	c.radial_segments = 8
	var bras := BoxMesh.new()
	bras.size = Vector3(0.08, 0.08, 2.2)
	var tete := BoxMesh.new()
	tete.size = Vector3(0.35, 0.12, 0.7)
	var gris := Color(0.55, 0.57, 0.58)
	var m := _assembler([[c, Transform3D(Basis(), Vector3(0, 4.5, 0)), gris], [bras, Transform3D(Basis(Vector3.RIGHT, -0.15), Vector3(0, 8.95, 1.0)), gris]], mat)
	var t := _assembler([[tete, Transform3D(Basis(), Vector3(0, 9.05, 2.0)), Color.WHITE]], mat_lampe_ref)
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, t.surface_get_arrays(0))
	m.surface_set_material(1, mat_lampe_ref)
	m.set_meta("lampe", mat_lampe_ref)
	return m
