interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** URL of the PMTiles basemap file (e.g. /tiles/cordoba.pmtiles). Plain background if unset. */
  readonly VITE_PMTILES_URL?: string;
  /** Base URL for map glyphs and sprites; defaults to the Protomaps assets on GitHub Pages. */
  readonly VITE_MAP_ASSETS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
