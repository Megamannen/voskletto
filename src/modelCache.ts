export const MODEL_CACHE = 'voskletto';

/** Models are stored under `path?id`, so a missing entry or a different id means the model must be fetched */
export const needsModelFetch = (cachedUrl: string | undefined, id: string): boolean =>
  cachedUrl === undefined || cachedUrl.split('?')[1] !== id;
