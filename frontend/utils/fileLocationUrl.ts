/** Keep directory separators readable without decoding reserved filename characters. */
export function fileLocationUrl(url: URL): string {
  const query = url.search.replace(/([?&]path=)([^&]*)/g,
    (_match, prefix: string, value: string) => prefix + value.replace(/%2F/gi, '/'));
  return `${url.origin}${url.pathname}${query}${url.hash}`;
}
