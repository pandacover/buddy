import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Buddy",
    identifier: "dev.pandacover.buddy",
    version: "0.1.0",
    description: "a heyclicky alt for windows",
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "dist/mainview/index.html": "views/mainview/index.html",
      "dist/mainview/assets": "views/mainview/assets",
      "dist/overlay/index.html": "views/overlay/index.html",
      "dist/overlay/assets": "views/overlay/assets",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
      autoGrantPermissions: ["microphone"],
    },
  },
} satisfies ElectrobunConfig;
