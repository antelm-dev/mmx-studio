import { useMemo } from "react";
import { chakra } from "@chakra-ui/react";
import { getDefinition } from "@mmx/content-schema";
import {
  getDecorationPreview,
  getSpritePreview,
} from "@mmx/renderer-pixi";
import { starterAssets } from "../assets/studioAssets.js";

const ring = "0 0 0 1px {colors.studio.border}";

interface Props {
  definitionId?: string;
  assetId?: string;
  size?: number;
  flip?: boolean;
  fallbackColor?: string | null;
}

export function SpritePreview({
  definitionId,
  assetId,
  size = 48,
  flip = false,
  fallbackColor,
}: Props) {
  const preview = useMemo(() => {
    if (assetId) return getDecorationPreview(assetId, starterAssets.catalog);
    if (!definitionId) return null;
    const def = getDefinition(definitionId);
    return def ? getSpritePreview(def, starterAssets.catalog) : null;
  }, [definitionId, assetId]);

  if (preview) {
    const [rx, ry, rw, rh] = preview.region;
    const scale = Math.min(size / rw, size / rh);
    return (
      <chakra.span
        display="grid"
        placeItems="center"
        flex="none"
        overflow="hidden"
        rounded="md"
        bg="studio.raised"
        boxShadow={ring}
        style={{ width: size, height: size, transform: flip ? "scaleX(-1)" : undefined }}
        title={assetId ?? definitionId}
      >
        <chakra.span
          position="relative"
          overflow="hidden"
          flex="none"
          imageRendering="pixelated"
          style={{ width: rw, height: rh, transform: `scale(${scale})` }}
        >
          <chakra.img
            position="absolute"
            maxW="none"
            imageRendering="pixelated"
            pointerEvents="none"
            src={preview.imageUrl}
            style={{ left: -rx, top: -ry }}
            alt=""
            draggable={false}
          />
        </chakra.span>
      </chakra.span>
    );
  }

  if (fallbackColor) {
    return (
      <chakra.span
        display="block"
        flex="none"
        rounded="md"
        boxShadow={ring}
        style={{ width: size, height: size, background: fallbackColor }}
      />
    );
  }
  return null;
}
