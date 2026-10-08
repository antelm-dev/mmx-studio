import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectDocument } from "@mmx/project-schema";
import { describe, expect, it } from "vitest";
import { buildStudioAssets, starterAssets, type StudioGameData } from "./studioAssets.js";

const fixtureRoot = resolve(__dirname, "../../../../tests/project-io/fixtures/minimal-project");
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(fixtureRoot, path), "utf8"));
const project = readJson("project.json") as ProjectDocument;
const gameData = readJson("game/data.json") as StudioGameData;
const resolveUrl = (asset: { path: string }): string => `fixture://${asset.path}`;

describe("buildStudioAssets", () => {
  it("resolves the player sheet and bindings from a loaded project", () => {
    const { manifest, soundIds } = buildStudioAssets(project, gameData, resolveUrl);
    expect(manifest.playerSheet).toBe("sprite.player.fixture");
    expect(manifest.playerSheets.pointing_cannon).toBe("sprite.player.fixture");
    expect(manifest.sheetUrls["sprite.player.fixture"]).toBe("fixture://assets/sprites/player.png");
    expect(manifest.shotAnims.sheets.lemon).toBe("sprite.bg");
    expect(manifest.hudSheets.xBar).toBe("sprite.bg");
    expect(soundIds).toEqual([]);
    expect(starterAssets.manifest.playerSheet).not.toBe(manifest.playerSheet);
    // Starter sheets are data URLs, like the ones the project bridge returns.
    expect(starterAssets.manifest.sheetUrls[starterAssets.manifest.playerSheet]).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("throws a readable error for missing or invalid bindings", () => {
    const broken = { bindings: { ...gameData.bindings, playerAnimation: "anim.nope" } };
    expect(() => buildStudioAssets(project, broken, resolveUrl)).toThrow(/anim\.nope/);
    expect(() => buildStudioAssets(project, {} as StudioGameData, resolveUrl)).toThrow(/bindings/);
    expect(() => buildStudioAssets(project, gameData, () => "")).toThrow(/empty string/);
  });
});
