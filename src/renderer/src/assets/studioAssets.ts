import type { ProjectAsset, ProjectDocument } from "@mmx/project-schema";
import {
  buildRendererAssetManifestFromProject,
  createAssetCatalog,
  createRendererAssetResolver,
  type RendererAssetBindings,
  type ShotAnimManifest,
} from "@mmx/renderer-pixi";
import starterProjectJson from "../../../../templates/mmx-starter/project.json";
import studioGameDataJson from "../../../../templates/mmx-starter/game/data.json";

type StudioGameData = {
  bindings: {
    playerAnimation: string;
    playerPointingSheet: string;
    sounds: Record<string, string>;
    enemyAnimations: Record<string, string>;
    pickupAnimations: Record<string, string>;
    shotAnimations: Record<string, string>;
    hudSprites?: Record<string, string>;
  };
};

const bundledAssetUrls = import.meta.glob(
  "../../../../templates/mmx-starter/assets/**/*",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

export const studioProject = starterProjectJson as ProjectDocument;
const studioGameData = studioGameDataJson as StudioGameData;

export function resolveStudioAssetUrl(asset: ProjectAsset): string {
  const suffix = `/templates/mmx-starter/${asset.path}`.replaceAll("\\", "/");
  const match = Object.entries(bundledAssetUrls).find(([sourcePath]) =>
    sourcePath.replaceAll("\\", "/").endsWith(suffix),
  );
  if (!match) throw new Error(`Starter asset '${asset.id}' is not bundled (${asset.path}).`);
  return match[1];
}

const playerAnimation = studioProject.assets.find(
  (asset) => asset.id === studioGameData.bindings.playerAnimation,
);
if (!playerAnimation || playerAnimation.kind !== "animation" || !playerAnimation.sheetAssetId) {
  throw new Error("Starter player animation is missing its sprite sheet binding.");
}

const hud = studioGameData.bindings.hudSprites;
if (!hud?.xBar || !hud.hpFill || !hud.weaponBar) {
  throw new Error("Starter HUD sprite bindings are incomplete.");
}

const sheetImages = Object.fromEntries(
  studioProject.assets
    .filter((asset) => asset.kind === "image" || asset.kind === "sprite")
    .map((asset) => [asset.id, asset.id]),
);
const firstShotAnimation = Object.values(studioGameData.bindings.shotAnimations)[0];
if (!firstShotAnimation) throw new Error("Starter shot animation bindings are empty.");

const rendererBindings: RendererAssetBindings = {
  playerAnimation: studioGameData.bindings.playerAnimation,
  playerSheetNormal: playerAnimation.sheetAssetId,
  playerSheetPointing: studioGameData.bindings.playerPointingSheet,
  enemyActors: { ...studioGameData.bindings.enemyAnimations },
  pickupActors: { ...studioGameData.bindings.pickupAnimations },
  shotAnimations: firstShotAnimation,
  sheetImages,
  hudSheets: {
    xBar: hud.xBar,
    hpFill: hud.hpFill,
    weaponBar: hud.weaponBar,
    weaponIconDarkArrow: hud.weaponIconDarkArrow,
  },
};

const resolver = createRendererAssetResolver({
  assets: studioProject.assets,
  resolveUrl: resolveStudioAssetUrl,
});
const shotAnims: ShotAnimManifest = { sheets: {}, animations: {} };
for (const [clipName, assetId] of Object.entries(studioGameData.bindings.shotAnimations)) {
  const asset = resolver.requireKind(assetId, ["animation"]);
  const clip = asset.animations[clipName] ?? Object.values(asset.animations)[0];
  if (!clip) throw new Error(`Starter shot animation '${assetId}' has no clips.`);
  const sheet = asset.sheetAssetId ?? asset.id;
  shotAnims.sheets[clipName] = resolver.sheetKey(sheet);
  shotAnims.animations[clipName] = clip;
}

export const studioRendererManifest = buildRendererAssetManifestFromProject(
  studioProject,
  rendererBindings,
  resolveStudioAssetUrl,
  { shotAnims },
);
export const studioAssetCatalog = createAssetCatalog({ manifest: studioRendererManifest });
export const studioSoundBindings = { ...studioGameData.bindings.sounds };
export const studioSoundAssetIds = [...new Set(Object.values(studioSoundBindings))];
