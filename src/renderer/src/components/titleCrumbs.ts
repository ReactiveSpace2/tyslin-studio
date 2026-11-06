/** The Default project's id (it isn't an agency, so breadcrumbs skip it). Null when it can't be read. */
export const getDefaultProjectIdSafe = (): Promise<string | null> =>
  window.tyslin.studio.defaultProject().then((p) => p.id, () => null)
