# Views vendor libraries (offline UMD globals; load order and module mapping in `manifest.json`)
- react@18.3.1, react-dom@18.3.1, react-is@18.3.1 (MIT): `https://unpkg.com/<pkg>@18.3.1/umd/<pkg>.production.min.js`
- prop-types@15.8.1 (MIT): `https://unpkg.com/prop-types@15.8.1/prop-types.min.js`
- recharts@3.10.1 (MIT; bundles MIT/ISC deps): `https://unpkg.com/recharts@3.10.1/umd/Recharts.js` (already minified; needs React, ReactDOM, ReactIs)
- lucide-react@1.0.0 (ISC, Feather portions MIT): `https://unpkg.com/lucide-react@1.0.0/dist/umd/lucide-react.min.js` (1.0.0 is the last release with a UMD build)
- `react-lowercase-alias.js` sets `window.react`, which the lucide-react UMD reads instead of `window.React`.
- @tailwindcss/browser@4.3.3 (MIT): `https://unpkg.com/@tailwindcss/browser@4.3.3/dist/index.global.js` (self-contained, no runtime fetches)
- All licenses are GPL-3 compatible. React 19 ships no UMD build, so React stays on 18.x.
- To refresh: curl the new versions over these files under the same names, then update `version` in `manifest.json` and this README.
