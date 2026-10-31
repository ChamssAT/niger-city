// Sol sahélien : sable ocre et latérite rouge en grandes taches, berges humides près du fleuve.
shader_type spatial;

uniform sampler2D tex_sable : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nor_sable : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D tex_laterite : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
global uniform float humidite;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 w = wpos.xz;
	vec3 sable = texture(tex_sable, w * 0.06).rgb * vec3(1.32, 1.08, 0.82);
	vec3 lat = texture(tex_laterite, w * 0.05).rgb * vec3(1.45, 1.02, 0.78);
	float m = texture(tex_laterite, w * 0.004).r * 0.6 + texture(tex_sable, w * 0.0013).g * 0.6;
	vec3 base = mix(sable, lat, smoothstep(0.35, 0.65, m));
	float mouille = clamp(COLOR.r + humidite * 0.5, 0.0, 1.0);
	base *= 1.0 - mouille * 0.35;
	ALBEDO = base;
	ROUGHNESS = 0.97 - mouille * 0.4;
	NORMAL_MAP = texture(nor_sable, w * 0.06).rgb;
}
