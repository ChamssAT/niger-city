# NIGER CITY — Chapitre 1 : Niamey

Prototype web d'un jeu en monde ouvert inspiré de GTA, situé au Niger. Il est fait avec Three.js, sans étape de build.

## Lancer le jeu
```bash
cd ~/Jeux/NigerCity && ./lancer.sh        # puis http://localhost:8080
```
Un serveur local est nécessaire, car les modules ES ne se chargent pas en `file://`.

## Commandes
- ZQSD / WASD / flèches : marcher, conduire.
- E : monter ou descendre d'un véhicule. On peut aussi voler une voiture en circulation.
- Maj : courir. Espace : sauter, ou frein à main en voiture.
- H : klaxon. T : service de taxi (dans un taxi rouge et blanc).
- M : grande carte. C : caméra proche ou lointaine. P / Échap : pause. N : son. I : performances.

## Contenu
- **Niamey stylisée** : rive gauche (Plateau, centre-ville, Kalley, Boukoki, Yantala…), fleuve Niger, rive droite (Harobanda, Kirkissoye).
- **Lieux** : Grande Mosquée, Grand Marché, Petit Marché, musée Boubou Hama (avec dinosaure), ponts Kennedy et Seyni Kountché, Hôtel Gaweye, Palais des Congrès, Assemblée, Présidence, Place de la Concertation, stade, gare routière, université, rizières.
- **Véhicules** : taxis rouge et blanc, kabou-kabou (motos), talladjé (504 break), faba-faba (minibus), pick-up, camions, police.
- **Missions** : découverte des 18 lieux, livraisons chronométrées, courses de taxi, course de kabou-kabou, 12 Croix d'Agadez cachées.
- **Police** : 1 à 5 étoiles, poursuites, arrestation au commissariat.
- **Rendu** : textures photo PBR (CC0, Poly Haven), ciel physique, cycle jour/nuit, ombres, bloom, brume, reflets.
- **Sauvegarde** automatique dans le navigateur (argent, lieux découverts, croix trouvées).

## Structure
| Fichier | Rôle |
|---|---|
| `js/main.js` | Rendu, boucle de jeu, joueur, caméra, police, jour/nuit |
| `js/world.js` | Génération de la ville, routes, fleuve, monuments, collisions |
| `js/materials.js` | Matériaux PBR avec UV en coordonnées monde |
| `js/vehicles.js` | Modèles 3D et physique des véhicules |
| `js/humans.js` | Personnages instanciés (boubous, pagnes, foulards) |
| `js/traffic.js` / `js/peds.js` | Circulation IA et piétons |
| `js/missions.js` / `js/hud.js` | Missions, mini-carte, interface |
| `assets/tex/` | Textures CC0 Poly Haven |
| `vendor/` | Three.js r160 en local |
