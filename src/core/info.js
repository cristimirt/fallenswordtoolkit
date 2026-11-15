// What the loader told the bundle: the build number and the site it was loaded from. `version` is the toolkit's version (package.json).
export const info = { build: 'dev', base: '', version: typeof __FST_VERSION__ === 'string' ? __FST_VERSION__ : 'dev' };
export function setInfo(ctx) {
  if (!ctx) return;
  if (ctx.build) info.build = String(ctx.build);
  if (ctx.base) info.base = ctx.base;
}
