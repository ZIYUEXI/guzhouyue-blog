# Incremental Starfield Versioning

When new Articles are added after a Published Starfield exists, Starfield Management will use an Incremental Starfield Version instead of mutating the active Published Starfield or asking administrators to rebuild everything from scratch.

An Incremental Starfield Version is derived from a Parent Starfield Version. Existing accepted Passages are copied forward and remain accepted, preserving the administrator's Passage Review work and avoiding repeated Passage curation for unchanged Articles. New Articles produce new Passage Suggestions inside the child version only.

Passage Relationships will be regenerated across all accepted Passages in the child version, including inherited Passages and newly accepted Passages. The regenerated relationship set will be compared to the Parent Starfield Version with a Relationship Rebuild Diff:

- `reconfirmed`: the same Passage pair and Relationship Type still exist; keep the relationship accepted.
- `new`: the relationship did not exist in the parent; require review.
- `changed`: the Passage pair still exists but the Relationship Type or meaning changed; require review.
- `removed`: the parent relationship is no longer generated; hide it in the child version and show it in the diff.

Reconfirmed Relationships should retain the previously reviewed Relationship Rationale by default. Regenerated rationale text may be kept for review context, but it should not silently replace reader-visible rationale without administrator review. Strength and evidence keywords may be refreshed because they are derived relationship metadata rather than reviewed explanatory copy.

Publishing an Incremental Starfield Version makes it the new Published Starfield. The Parent Starfield Version remains available for rollback. This keeps Reader-visible starfield updates atomic while allowing relationship structure to be rebuilt as the content corpus grows.
