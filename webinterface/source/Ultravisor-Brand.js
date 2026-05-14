/**
 * Ultravisor-Brand — the application's wordmark / signature.
 *
 * Passed to pict-section-theme as the `Brand` block on the Theme-Section
 * provider. Drives:
 *   - The Theme-Brand-Mark view in the topbar (icon + name)
 *   - --brand-color-* CSS variables that themes / app CSS reference
 *   - The Favicon / FaviconDark SVGs available via libThemeBrand
 *
 * The brand is precomputed at build time. Source of truth lives in
 * `Retold-Modules-Manifest.json` under this module's `Branding.Palette`
 * field; the `pict-section-theme-brand` CLI generates the deterministic
 * logo + colors and writes them into our `package.json` under
 * `retold.brand`. This file then just hands that block to Theme-Section.
 *
 * To change the look:
 *
 *   1. Edit the Branding block in Retold-Modules-Manifest.json (palette,
 *      DisplayName, Tagline).
 *   2. Run `npm run brand` to regenerate package.json + favicon files.
 *   3. Run `npm run build` to rebuild the bundle.
 *
 * Curated palette keys: mix, default, desert, ocean, forest, synthwave,
 * twilight, cosmos, carnival.
 */

// Path: source/ → up 1 to webinterface/.
const tmpPackage = require('../package.json');

if (!tmpPackage.retold || !tmpPackage.retold.brand)
{
	throw new Error('ultravisor-webinterface: package.json is missing retold.brand — '
		+ 'run `npm run brand` (which calls pict-section-theme-brand) before building');
}

module.exports = tmpPackage.retold.brand;
