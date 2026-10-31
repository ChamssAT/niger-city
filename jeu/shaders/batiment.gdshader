// Façades de Niamey : enduit banco/ciment (texture photo), fenêtres à volets métalliques,
// portes en tôle peinte, poussière rouge au pied des murs, fenêtres éclairées la nuit.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D tex_mur : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nor_mur : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
global uniform float humidite;
global uniform float nuit;

varying vec3 wpos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	bool toit = COLOR.a < 0.5;
	vec2 uvt = toit ? wpos.xz * 0.25 : UV * 0.3;
	vec3 tex = texture(tex_mur, uvt).rgb;
	float var_grande = texture(tex_mur, wpos.xz * 0.013).r;
	vec3 base = COLOR.rgb * mix(vec3(1.0), tex * 2.0, 0.7) * (0.9 + var_grande * 0.2);
	float rough = 0.93;
	vec3 emis = vec3(0.0);
	if (!toit) {
		float etage = floor((UV.y - 0.4) / 3.1);
		float yl = UV.y - 0.4 - etage * 3.1;
		float cell = floor(UV.x / 3.6);
		float xl = UV.x - cell * 3.6;
		float graine = floor(wpos.x * 0.05) * 7.0 + floor(wpos.z * 0.05);
		float r = hash(vec2(cell + graine, etage));
		float r2 = hash(vec2(etage * 3.1 + graine, cell * 1.7));
		vec3 metal = mix(vec3(0.16, 0.42, 0.26), vec3(0.18, 0.32, 0.58), step(0.5, r2));
		metal = mix(metal, vec3(0.42, 0.42, 0.44), step(0.8, r2));
		bool porte = etage < 0.5 && r < 0.22 && xl > 1.0 && xl < 2.3 && yl > -0.4 && yl < 2.25;
		bool fen = r > 0.3 && xl > 1.15 && xl < 2.45 && yl > 1.05 && yl < 2.2;
		bool cadre = r > 0.3 && xl > 1.0 && xl < 2.6 && yl > 0.92 && yl < 2.33 && !fen;
		if (porte) {
			base = metal * (0.85 + 0.15 * step(0.5, fract(xl * 6.0)));
			rough = 0.5;
		} else if (fen) {
			bool volet = r2 > 0.35;
			base = volet ? metal * (0.8 + 0.2 * step(0.5, fract(yl * 9.0))) : vec3(0.05, 0.07, 0.08);
			rough = volet ? 0.55 : 0.15;
			if (r2 > 0.62) emis = vec3(1.0, 0.72, 0.4) * nuit * 1.6 * step(0.35, hash(vec2(r, r2)));
		} else if (cadre) {
			base *= 1.12;
		}
		// poussière de latérite remontant sur le bas des murs
		float pied = 1.0 - smoothstep(0.0, 0.9 + var_grande * 0.6, UV.y);
		base = mix(base, vec3(0.55, 0.3, 0.17), pied * 0.55);
	}
	base *= 1.0 - humidite * 0.25;
	ALBEDO = base;
	ROUGHNESS = rough - humidite * 0.3;
	NORMAL_MAP = texture(nor_mur, uvt).rgb;
	NORMAL_MAP_DEPTH = 0.8;
	EMISSION = emis;
}
