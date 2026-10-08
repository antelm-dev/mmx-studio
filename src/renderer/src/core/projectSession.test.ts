import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@mmx/renderer-pixi", () => ({
  resetSheetCache: vi.fn(async () => {
    await Promise.resolve();
    calls.push("reset");
  }),
}));

vi.mock("../assets/studioAssets.js", () => {
  const fakeAssets = (name: string) => ({
    catalog: { load: async () => void calls.push(`load:${name}`) },
  });
  return {
    starterAssets: fakeAssets("starter"),
    buildStarterAssets: () => {
      calls.push("build:starter");
      return fakeAssets("starter");
    },
    buildStudioAssets: () => {
      calls.push("build:project");
      return fakeAssets("project");
    },
  };
});

vi.mock("@mmx/project-io", () => ({ PROJECT_VALIDATION: {}, updateLevelDocument: vi.fn() }));
vi.mock("@mmx/project-schema", () => ({ validateProject: () => ({ issues: [] }) }));

const { ProjectSession } = await import("./projectSession.js");

const project = { manifest: { assets: [] }, levels: [] };
const bridge = {
  pickDirectory: async () => "/projects/b",
  load: async () => ({ ok: true, issues: [], value: { rootPath: "/projects/b", project } }),
  readPlayAssets: async () => {
    calls.push("read");
    return { ok: true, issues: [], value: { gameData: {}, urls: {} } };
  },
};

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe("ProjectSession asset switch", () => {
  it("releases old renderers, then awaits the sheet reset, then loads the new sheets", async () => {
    vi.stubGlobal("window", { studio: { project: bridge } });
    const session = new ProjectSession();
    session.beforeSheetReset = () => calls.push("release");

    await session.openProject();
    expect(await session.getAssets()).not.toBeNull();
    expect(calls).toEqual(["release", "reset", "read", "build:project", "load:project"]);
  });

  it("reloads a fresh starter after the reset when the project closes", async () => {
    vi.stubGlobal("window", { studio: { project: bridge } });
    const session = new ProjectSession();
    session.beforeSheetReset = () => calls.push("release");

    await session.openProject();
    await session.getAssets();
    calls.length = 0;
    session.close();
    await session.getAssets();
    expect(calls).toEqual(["release", "reset", "build:starter", "load:starter"]);
  });
});
