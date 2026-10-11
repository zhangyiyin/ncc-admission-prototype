# Merkle Witness Schema

M2 witnesses contain `leaf`, `index`, `siblings`, `pathIndices`, and `root`. For M2, `siblings.length = pathIndices.length = 8`. All leaves, siblings, and roots are decimal BN254 field strings.
