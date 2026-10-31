#!/usr/bin/env bash
# Lance Niger City (Godot). Options : ./lancer.sh basse|moyenne|haute|ultra
# Sans vraie carte graphique Vulkan (ex. Intel HD 3000), on force OpenGL :
# le Vulkan logiciel (llvmpipe) fait planter Godot 4.7.2 et serait de toute façon très lent.
cd "$(dirname "$0")"
PILOTE=(--rendering-driver opengl3)
if command -v vulkaninfo >/dev/null && vulkaninfo --summary 2>/dev/null | grep -qE "PHYSICAL_DEVICE_TYPE_(DISCRETE|INTEGRATED)_GPU"; then
  PILOTE=()
fi
ARGS=()
[ -n "${1:-}" ] && ARGS=(-- --qualite="$1")
exec godot --path . "${PILOTE[@]}" "${ARGS[@]}" ${NIGERCITY_TEST:-}
