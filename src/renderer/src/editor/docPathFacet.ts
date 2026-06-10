import { Facet } from '@codemirror/state'

/** Absolute path of the open document; used to resolve relative image/link targets. */
export const docPathFacet = Facet.define<string | null, string | null>({
  combine: (values) => (values.length ? values[0] : null)
})
