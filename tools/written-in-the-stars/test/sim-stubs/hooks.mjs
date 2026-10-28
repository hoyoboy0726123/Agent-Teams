// A module resolve hook for the engine tests: a module of another track that does not exist yet (the data, the
// chart engine, the story) resolves to its stand-in in this folder. A module that exists is always the real one.
let stubs = {};
export async function initialize(data) { stubs = (data && data.stubs) || {}; }
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e && e.code === "ERR_MODULE_NOT_FOUND" && context.parentURL) {
      const url = new URL(specifier, context.parentURL).href;
      for (const [suffix, stub] of Object.entries(stubs)) if (url.endsWith(suffix)) return { url: stub, shortCircuit: true };
    }
    throw e;
  }
}
