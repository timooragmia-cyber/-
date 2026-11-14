// Lets CLI scripts reuse server modules: "server-only" guards against bundling into client
// components and has no meaning outside Next, so it resolves to an empty module here.
import { registerHooks } from "node:module";

const empty = new URL("./empty.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: empty, format: "commonjs", shortCircuit: true };
    return next(specifier, context);
  },
});
