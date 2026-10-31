// Routes : goudron bordé de poussière de latérite, pistes en latérite rouge ou en sable,
// marquages au sol, flaques et reflets quand il pleut.
// COLOR.r = classe / 10, COLOR.g = revêtement / 2, COLOR.b = pont, COLOR.a = largeur / 40
shader_type spatial;

uniform sampler2D tex_goudron : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nor_goudron : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D tex_laterite : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D tex_sable : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
global uniform float humidite;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 w = wpos.xz;
	int rv = int(round(COLOR.g * 2.0));
	float cl = COLOR.r * 10.0;
	float larg = COLOR.a * 40.0;
	vec3 goudron = texture(tex_goudron, w * 0.11).rgb * vec3(0.72, 0.7, 0.66);
	vec3 laterite = texture(tex_laterite, w * 0.09).rgb * vec3(1.42, 1.0, 0.78);
	vec3 sable = texture(tex_sable, w * 0.07).rgb * vec3(1.3, 1.08, 0.82);
	float bruit = texture(tex_laterite, w * 0.011).r;
	vec3 base;
	float rough = 0.95;
	if (rv == 0) {
		base = goudron;
		rough = 0.85;
		float d_bord = min(UV.x, 1.0 - UV.x) * larg;           // mètres depuis le bord
		float poussiere = 1.0 - smoothstep(0.0, 1.2 + bruit * 2.0, d_bord);
		float c = abs(UV.x - 0.5) * larg;
		if (cl < 2.5 && c < 0.09 && fract(UV.y / 9.0) < 0.45) base = vec3(0.82, 0.8, 0.74);
		if (cl < 1.5 && abs(d_bord - 0.6) < 0.08) base = vec3(0.8, 0.78, 0.72);
		base = mix(base, laterite * 0.95, poussiere * 0.85);
		base = mix(base, laterite, smoothstep(0.55, 0.8, bruit) * 0.25);
	} else if (rv == 1) {
		base = mix(laterite, sable, smoothstep(0.3, 0.7, bruit) * 0.4);
	} else {
		base = mix(sable, laterite, 0.25);
	}
	// pluie : chaussée assombrie, flaques brillantes
	float flaque = smoothstep(0.62, 0.7, bruit) * humidite;
	base *= 1.0 - humidite * 0.35;
	ALBEDO = base;
	ROUGHNESS = mix(rough - humidite * 0.45, 0.04, flaque);
	SPECULAR = 0.5 + humidite * 0.3;
	NORMAL_MAP = rv == 0 ? texture(nor_goudron, w * 0.11).rgb : vec3(0.5, 0.5, 1.0);
}
