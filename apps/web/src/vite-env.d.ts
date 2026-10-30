interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** URL of the PMTiles basemap file (e.g. /tiles/cordoba.pmtiles). Plain background if unset. */
  readonly VITE_PMTILES_URL?: string;
  /** Basemap tiles as a `{z}/{x}/{y}.pbf` URL template (our own files, e.g. /tiles/cordoba/…). */
  readonly VITE_TILES_URL?: string;
  /** Base URL for map glyphs and sprites; defaults to the Protomaps assets on GitHub Pages. */
  readonly VITE_MAP_ASSETS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
