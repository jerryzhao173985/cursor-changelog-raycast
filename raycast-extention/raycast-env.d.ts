/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Firecrawl API Key - API key for the Firecrawl service */
  "apiKey": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `view-changelog` command */
  export type ViewChangelog = ExtensionPreferences & {}
  /** Preferences accessible in the `update-changelog` command */
  export type UpdateChangelog = ExtensionPreferences & {}
  /** Preferences accessible in the `get-latest` command */
  export type GetLatest = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `view-changelog` command */
  export type ViewChangelog = {}
  /** Arguments passed to the `update-changelog` command */
  export type UpdateChangelog = {}
  /** Arguments passed to the `get-latest` command */
  export type GetLatest = {}
}

