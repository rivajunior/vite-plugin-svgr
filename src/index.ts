import type { Config } from "@svgr/core";
import fs from "node:fs/promises";
import { Plugin, ResolvedConfig, transformWithOxc, UserConfig } from "vite";

type OxcTransformOptions = NonNullable<Parameters<typeof transformWithOxc>[2]>;
type FilterPattern = string | RegExp | (string | RegExp)[];
interface VitePluginSvgrOptions {
  svgrOptions?: Config;
  oxcOptions?: OxcTransformOptions;
  exclude?: FilterPattern;
  include?: FilterPattern;
}

export default function vitePluginSvgr({
  svgrOptions,
  oxcOptions,
  include = "**/*.svg?react",
  exclude,
}: VitePluginSvgrOptions = {}): Plugin {
  const postfixRE = /[?#].*$/s;
  let config: ResolvedConfig;

  return {
    name: "vite-plugin-svgr",
    enforce: "pre", // to override `vite:asset`'s behavior
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    load: {
      filter: {
        id: {
          include,
          exclude,
        },
      },
      async handler(id) {
        const reactPlugin = config.plugins.find(
          (plugin) => plugin.name === "vite:react-babel",
        );

        if (reactPlugin == null) {
          this.error(
            "`vite-plugin-svgr` requires `@vitejs/plugin-react` or `@vitejs/plugin-react-swc` to work properly.",
          );
        }
        const configHook = reactPlugin?.config;
        const configFn =
          typeof configHook === "function" ? configHook : configHook?.handler;
        const reactOptions = configFn?.call(
          this,
          // @vitejs/plugin-react doesn't use the config parameter
          undefined as unknown as UserConfig,
          { command: config.command, mode: config.mode },
        ) as Omit<UserConfig, "plugins">;

        const filePath = id.replace(postfixRE, "");
        const svgCode = await fs.readFile(filePath, "utf8");
        // `tsx` injects an import-interop helper here during tests, which adds
        // an unreachable branch to coverage for these ESM-only modules.
        /* c8 ignore next 2 */
        const { transform: svgrTransform } = await import("@svgr/core");
        const { default: jsx } = await import("@svgr/plugin-jsx");
        const componentCode = await svgrTransform(svgCode, svgrOptions, {
          filePath,
          caller: {
            defaultPlugins: [jsx],
          },
        });

        const res = await transformWithOxc(componentCode, id, {
          lang: "jsx",
          ...reactOptions.oxc,
          ...oxcOptions,
        });

        return {
          code: res.code,
          map: null, // TODO:
        };
      },
    },
  };
}
