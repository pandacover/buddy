export default {
  packageManager: "bun",
  electrobun: { version: "2.0.1" },
  scripts: {
    install: ["hutch", "pm", "install", "--frozen-lockfile"],
    start:
      "hutch electrobun prepare && hutch pm exec -- vite build --config vite.mainview.config.ts && hutch pm exec -- vite build --config vite.overlay.config.ts && hutch electrobun dev",
    dev: "hutch electrobun prepare && hutch pm exec -- vite build --config vite.mainview.config.ts && hutch pm exec -- vite build --config vite.overlay.config.ts && hutch electrobun dev --watch",
    "dev:hmr": [
      "hutch",
      "pm",
      "exec",
      "--",
      "concurrently",
      "hutch run hmr",
      "hutch run start",
    ],
    hmr: "hutch electrobun prepare && hutch pm exec -- vite --config vite.mainview.config.ts --port 5173",
    build:
      "hutch electrobun prepare && hutch pm exec -- vite build --config vite.mainview.config.ts && hutch pm exec -- vite build --config vite.overlay.config.ts && hutch electrobun build --env=stable",
    test: "bun test",
  },
};
