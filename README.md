# NIGER CITY

Jeu en monde ouvert situé au Niger. **Chapitre 1 : Niamey**, construite sur le vrai plan de la ville (OpenStreetMap).

| Dossier | Contenu |
|---|---|
| `jeu/` | Le jeu (Godot 4.7). Lancement : `./jeu/lancer.sh` (ou `./jeu/lancer.sh basse`) |
| `outils/osm_vers_jeu.py` | Convertit OpenStreetMap en tuiles de jeu (`jeu/donnees/`) |
| `references/` | Données OSM, images extraites des vidéos YouTube (référence visuelle uniquement, pas à intégrer) |
| `imagevideolienvideoniger/` | Photos et liens fournis par Chamssoudine |
| `prototype_web/` | Premier prototype Three.js (archivé) |

## Commandes du jeu
- ZQSD / flèches : se déplacer, conduire.
- E : monter ou descendre.
- Maj : courir. Espace : sauter, ou frein à main.
- C : caméra. O : météo. K : accélérer le temps.
- I : performances. Échap : menu (qualité, météo).
- Clic droit : viser (caméra par-dessus l'épaule). Clic gauche : tirer. R : recharger.
- 1, 2, 3, Tab ou molette : mains nues, pistolet, fusil. H : klaxon.
- Une manette est aussi prise en charge.

## Architecture (jeu/)
- `scripts/noyau/jeu.gd` : singleton (réglages, qualité, actions clavier et manette, heure, météo, quartiers).
- `scripts/noyau/principal.gd` : assemble la scène.
- `scripts/monde/flux_tuiles.gd` : charge les tuiles de 256 m autour du joueur, en threads.
- `scripts/monde/constructeur_tuile.gd` : produit la géométrie (bâtiments, routes, poteaux et câbles, ponts, berges, collisions).
- `scripts/monde/ambiance.gd` : ciel, soleil, jour/nuit, météo (saison sèche, harmattan, pluie).
- `scripts/vehicules/voiture.gd` : physique VehicleBody3D (suspensions, adhérence) ; la carrosserie est provisoire.
- `scripts/joueur/` : personnage et caméra. `scripts/ui/hud.gd` : mini-carte réelle, quartier, vitesse, menu.
- `scripts/personnages/` : corps humain commun (tenues boubou, pagne, jeune, police PMF), passants (`pnj.gd`), agents PMF (`policier.gd`).
- `scripts/systemes/` : foule, circulation IA, police et étoiles, armes (tir par rayon), sons générés par calcul.
- Tests sans écran : `godot --headless --path jeu -- --test-conduite` ; `-- --test-combat --capture=x.png --images=600` pour une capture.
- `shaders/` : façades (fenêtres, volets, portes, poussière), routes (goudron, latérite, marquages, pluie), sol, eau.

Données cartographiques : © contributeurs OpenStreetMap (licence ODbL), mention obligatoire dans les crédits du jeu.
