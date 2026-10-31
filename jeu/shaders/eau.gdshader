// Fleuve Niger : eau limoneuse vert-brun, vaguelettes animées, reflets du ciel.
shader_type spatial;

uniform vec3 couleur : source_color = vec3(0.24, 0.29, 0.23);
global uniform float humidite;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = wpos.xz;
	float t = TIME;
	float pluie = humidite * 0.6;
	vec3 n = vec3(
		sin(p.x * 0.31 + t * 0.9) * 0.05 + sin(p.y * 0.73 + p.x * 0.4 - t * 1.4) * 0.035 + sin(p.x * 3.1 + t * 6.0) * pluie * 0.05,
		1.0,
		cos(p.y * 0.27 - t * 0.7) * 0.05 + sin(p.x * 0.9 - p.y * 0.5 + t * 1.1) * 0.03 + cos(p.y * 2.7 - t * 5.0) * pluie * 0.05);
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(n), 0.0)).xyz);
	ALBEDO = couleur;
	ROUGHNESS = 0.06;
	SPECULAR = 0.65;
	METALLIC = 0.0;
}
