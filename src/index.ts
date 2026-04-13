import type { Config } from "@svgr/core";
import fs from "node:fs/promises";
import type { ESBuildOptions, Plugin, TransformOptions } from "vite";

type FilterPattern = string | RegExp | (string | RegExp)[];
interface VitePluginSvgrOptions {
  svgrOptions?: Config;
  esbuildOptions?: ESBuildOptions;
  oxcOptions?: TransformOptions;
  exclude?: FilterPattern;
  include?: FilterPattern;
  jsxRuntime?: "classic" | "automatic";
}

export default function vitePluginSvgr({
  svgrOptions,
  esbuildOptions,
  oxcOptions,
  include = "**/*.svg?react",
  exclude,
  jsxRuntime,
}: VitePluginSvgrOptions = {}): Plugin {
  const postfixRE = /[?#].*$/s;

  return {
    name: "vite-plugin-svgr",
    enforce: "pre", // to override `vite:asset`"s behavior
    config(_userConfig, { command }) {
      const isRolldownVersion = this.meta?.rolldownVersion != null;
      const runtime = jsxRuntime ?? "automatic";

      if (!isRolldownVersion) {
        return {
          esbuild: {
            jsx: runtime === "classic" ? "transform" : "automatic",
            ...esbuildOptions,
          },
        };
      }

      return {
        oxc: {
          jsx: { runtime, refresh: command === "serve" },
          ...oxcOptions,
        },
        ...(runtime === "automatic"
          ? {
              optimizeDeps: {
                rolldownOptions: { transform: { jsx: { runtime } } },
              },
            }
          : undefined),
      };
    },
    load: {
      filter: {
        id: {
          include,
          exclude,
        },
      },
      async handler(id) {
        const filePath = id.replace(postfixRE, "");
        const svgCode = await fs.readFile(filePath, "utf8");
        // `tsx` injects an import-interop helper here during tests, which adds
        // an unreachable branch to coverage for these ESM-only modules.
        /* c8 ignore next 2 */
        const { transform: svgrTransform } = await import("@svgr/core");
        const { default: jsx } = await import("@svgr/plugin-jsx");
        const componentCode = await svgrTransform(
          svgCode,
          {
            jsxRuntime,
            ...svgrOptions,
          },
          {
            filePath,
            caller: {
              defaultPlugins: [jsx],
            },
          },
        );

        return {
          code: componentCode,
          moduleType: "jsx",
          map: null, // TODO:
        };
      },
    },
  };
}
