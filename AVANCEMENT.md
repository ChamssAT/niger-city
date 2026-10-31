# Journal d'avancement — Niger City

## 2026-10-18 — v0.1 : prototype web jouable (Niamey)
- Fait : ville procédurale, 18 lieux, fleuve et 2 ponts, 8 types de véhicules, circulation IA, piétons, police avec étoiles.
- Fait : missions (livraisons, taxi, course moto, croix d'Agadez), HUD façon GTA, mini-carte orientée, grande carte.
- Fait : rendu PBR (textures CC0), ciel physique jour/nuit, ombres, bloom, sons synthétisés, contrôles tactiles, sauvegarde locale.
- Fait : 4 niveaux de qualité, compteur de performances (touche I), résolution dynamique si < 28 FPS.
- Testé dans Chromium en rendu logiciel (pas de GPU dans le test) : aucune erreur JS ; livraison, police, trafic, taxi et chute dans le fleuve vérifiés.
  Mesure en qualité Moyenne : environ 275 appels de dessin et 1,5 M de triangles par image, passe d'ombres comprise.
- À faire : mesurer les FPS réels sur la machine (GPU) et sur téléphone.
- Pistes réalisme : vrais personnages riggés (Mixamo / Ready Player Me) habillés en boubou, modèles 3D de véhicules (glTF),
  photos de Niamey pour les façades, radio avec musique nigérienne, voix en zarma et haoussa, plan plus fidèle (OpenStreetMap).
- Régions suivantes : Agadez, Zinder, Maradi, Tahoua, Dosso, Tillabéri, Diffa.

## 2026-10-18 — v0.2 : passage à Godot 4.7 et vrai plan de Niamey
- Choix : Godot 4 (gratuit, 0 % de redevance, export PC, web, Android ; consoles via éditeur partenaire).
- Le PC de dev (Intel HD 3000, 2011) tourne en rendu Compatibility. Les PC récents auront Forward+ automatiquement.
- Carte réelle via OpenStreetMap : 208 000 bâtiments, 16 700 routes, fleuve, îles, mares, 113 quartiers, 739 lieux, 209 000 arbres.
  Le tout tient en 11,5 Mo de tuiles de 256 m, chargées autour du joueur dans des threads.
- Références : 3 vidéos YouTube et 2 photos fournies.
  - Taxis tous blancs avec panneau TAXI jaune, latérite partout, poussière sur les bas-côtés.
  - Poteaux en bois et câbles, neems le long des axes, harmattan, pluie.
- Fait :
  - façades (fenêtres à volets métalliques, portes en tôle, poussière au pied des murs, fenêtres éclairées la nuit) ;
  - routes (goudron, latérite, sable, marquages, bas-côtés poussiéreux, flaques sous la pluie) ;
  - lampadaires, poteaux électriques avec câbles, ponts avec parapets et piles, berges et fleuve animé ;
  - météo (sec, harmattan, pluie), jour/nuit, mini-carte réelle orientée, nom du quartier ;
  - physique de voiture réaliste, 4 véhicules (taxi blanc, berline, 4x4, faba-faba), menu de qualité, prise en charge de la manette.
- Mesure en rendu logiciel (sans GPU, donc FPS non représentatifs) : 160 à 310 appels de dessin et 400 à 800 k triangles en qualité Moyenne.
- À faire en priorité :
  1. Mesurer les FPS réels sur le PC (touche I).
  2. Modèles 3D réalistes : voitures (Corolla, Starlet, Hiace, Land Cruiser) et personnages riggés et animés.
  3. Murs de concession le long des rues en latérite, circulation et piétons IA, sons (moteurs, klaxons, ville, appel à la prière).
  4. Lieux emblématiques modélisés (Grande Mosquée, Grand Marché, pont Kennedy), missions.

## 2026-10-18 — v0.2.1 : corrections après le premier essai de Chamssoudine
- Plantage au lancement : Godot 4.7.2 plante avec le Vulkan logiciel (llvmpipe), même sur un projet vide.
  Le lanceur force maintenant OpenGL quand il n'y a pas de vraie carte graphique Vulkan.
- Tonneaux dans les virages : centre de gravité abaissé, barre antiroulis (couple de rappel), adhérence ajustée,
  remise sur les roues automatique après 2 s sur le toit.
  Test de non-régression : `godot --headless --path jeu -- --test-conduite` (ancienne voiture : inclinaison −0,98, sur le toit ; nouvelle : 1,00).
- Nuit trop noire : clair de lune, ciel bleu nuit, ambiance relevée.
  Les 8 lampadaires les plus proches éclairent vraiment (4 en qualité basse). Les phares éclairent la route.

## 2026-10-18 — v0.3 : foule, circulation, police PMF et armes
- Passants (boubou, pagne, jeune) sur les bas-côtés des vraies rues : pauses, fuite au coup de feu, au klaxon ou devant une voiture rapide ;
  ils peuvent être renversés ou abattus.
- Circulation IA : roule à droite, enchaîne les rues aux carrefours, freine devant les obstacles, klaxonne quand ça bloque.
  On peut voler une voiture (le conducteur est éjecté).
- Armes : mains nues, pistolet (12 coups), fusil d'assaut (30 coups, rafale).
  Visée par-dessus l'épaule, recul, impacts de poussière, éclair au canon, rechargement, sons générés par calcul.
- PMF (police fictive) : 1 à 5 étoiles.
  - Agents à pied qui viennent arrêter le joueur (mains levées) ou ripostent s'il est dangereux.
  - Voitures blanches à bandes vertes et orange, gyrophare et sirène, qui poursuivent le joueur.
  - Les étoiles baissent hors de vue. Arrestation : amende et armes confisquées. Mort : hôpital le plus proche (OSM).
- Véhicules : dégâts aux chocs et aux balles, fumée, moteur coupé.
- HUD : réticule, santé et gilet, munitions, étoiles, argent en FCFA, annonces.
- Tests (rendu logiciel) en qualité moyenne : 3 étoiles, 7 agents, 2 voitures PMF, 22 passants, 11 voitures IA, sans erreur.
  Appels de dessin élevés (≈ 450-580) : sur le PC de dev, la qualité basse est recommandée.
