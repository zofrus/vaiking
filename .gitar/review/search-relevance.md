# Search relevance

Elasticsearch is this product's core data layer. Apply these to any change to
mappings, analyzers, query builders, or ranking.

- Search is hybrid: keyword plus semantic. Flag a change that silently drops
  either side.
- Once a golden relevance set exists in `tests/search/`, flag a query or
  ranking change that does not update it.
- Filters such as track, day, and room must be exact filters. Flag them when
  they would affect scoring.
- Flag a query with no timeout or no result size limit.
- Flag code that shows a raw Elasticsearch error to the user. An empty result
  needs a helpful message and a suggestion.
- Flag full user query text sent to a third party without a reason noted.
