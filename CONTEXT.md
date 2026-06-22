# Guzhouyue Blog

This context describes the reader-facing content language for Guzhouyue Blog. It keeps the blog's content discovery terms precise as the site grows beyond linear article lists.

## Language

**Reader**:
A public visitor who reads published blog content and uses discovery surfaces to move between related articles and ideas.
_Avoid_: User, customer, admin

**Knowledge Graph Index**:
A reader-facing discovery layer derived from published blog content that connects articles, concepts, and relationships.
_Avoid_: Knowledge graph platform, graph database, AI database

**Starfield Knowledge Map**:
A reader-facing exploration entry where published articles and their knowledge relationships are presented as a starfield. It complements normal reading, search, and article lists rather than replacing them.
_Avoid_: Main navigation, landing page, decoration

**Starfield Navigation Entry**:
A public navigation item that opens the Starfield Knowledge Map for Readers.
_Avoid_: Admin tool, hidden feature

**Published Starfield**:
The precomputed, reader-visible set of Visible Passages and reviewed Passage Relationships used by the Starfield Knowledge Map.
_Avoid_: Live extraction, draft graph

**Starfield Management**:
An administrator-facing area for generating, reviewing, and publishing starfield content.
_Avoid_: Article editor, public starfield

**Manual Starfield Generation**:
An administrator-triggered action that creates Passage Suggestions and Passage Relationship suggestions for review.
_Avoid_: Automatic publish hook, draft autosave

**Selected Article Generation**:
Manual Starfield Generation run against administrator-selected Articles before broader site-wide generation is considered.
_Avoid_: Full rebuild by default

**Passage-First Generation**:
A generation flow where Passage Suggestions are created and reviewed before Passage Relationship suggestions are created.
_Avoid_: One-shot graph generation

**Starfield Regeneration**:
An administrator-triggered action that creates a new candidate or published starfield version without destroying the previous usable version.
_Avoid_: Destructive rebuild

**Starfield Version**:
An administrator-managed snapshot of the Published Starfield. Administrators decide which Starfield Version is visible to Readers.
_Avoid_: Reader-selectable timeline

**Focused Star**:
The Passage currently selected by a Reader in the Starfield Knowledge Map. Focusing a star keeps the Reader in the map while revealing nearby related stars and an explicit path to the source Article.
_Avoid_: Open article, selected card

**Related Star**:
A Passage shown near a Focused Star because a reviewed Passage Relationship connects them. Related Stars should prefer Passages from different Articles and show the Relationship Type that explains the connection.
_Avoid_: Same-article outline, unlabeled edge

**Passage**:
A meaningful excerpt or section within a published article that can appear as its own star in the Starfield Knowledge Map. A Passage belongs to exactly one Article.
_Avoid_: Paragraph, block, snippet

**Source Article**:
The published Article that a Passage belongs to. The Source Article gives the Passage its reading context and destination for explicit article navigation.
_Avoid_: Parent page, container

**Passage Anchor**:
A stable destination inside a Source Article that lets a Reader navigate from a star directly to the corresponding Passage.
_Avoid_: Article top, scroll guess

**Passage Text**:
The source excerpt stored for a Passage so it can be displayed, searched, and later used as grounded context. It is taken from the Source Article without rewriting and is not a duplicate of the full Article.
_Avoid_: Full article copy, raw markdown dump, rewritten passage

**Passage Keyword**:
A concept, topic, tool, or named idea associated with a Passage. Passage Keywords help describe and retrieve stars without becoming stars themselves in the first version.
_Avoid_: Concept node, tag-only navigation

**Canonical Passage Keyword**:
A normalized Passage Keyword produced by merging highly similar Passage Keywords across Passages. It gives relationship generation a shared vocabulary while remaining evidence for Passage Relationships rather than a visible node.
_Avoid_: Keyword node, concept node, reader-facing tag

**Keyword-Derived Relationship**:
A Passage Relationship proposed because multiple Passages share the same normalized Passage Keyword or highly similar Passage Keywords. The normalized keyword is evidence for the edge, not a graph node.
_Avoid_: Keyword node, tag node, concept star

**Passage Relationship**:
A reader-facing connection between two Passages, including connections across different Articles.
_Avoid_: Article relationship, backlink

**Cross-Article Relationship**:
A Passage Relationship where the connected Passages come from different Source Articles. Cross-Article Relationships are the primary discovery value of the Starfield Knowledge Map.
_Avoid_: Same-article outline

**Same-Article Relationship**:
A Passage Relationship where the connected Passages come from the same Source Article. Same-Article Relationships provide local context but are not the primary discovery value of the Starfield Knowledge Map.
_Avoid_: Cross-article discovery

**Passage Title**:
The short visible label used for a Passage star in the Starfield Knowledge Map. It is meant to be readable, specific, and concise.
_Avoid_: Full heading tree, article title

**Star Size**:
The visual scale of a Passage star. In the Starfield Knowledge Map, Star Size represents connection strength or relationship richness rather than article importance.
_Avoid_: Popularity score, ranking

**Star Color**:
The visual color of a Passage star. In the Starfield Knowledge Map, Star Color reflects the Source Article's category.
_Avoid_: Relationship type, status flag

**Global Starfield View**:
The initial Starfield Knowledge Map view that shows the overall constellation before a Reader focuses any star.
_Avoid_: Default focused star, random starting point

**Passage Curation**:
The act of choosing meaningful Passages from a published Article for reader exploration.
_Avoid_: Paragraph splitting, chunking

**Passage Suggestion**:
A candidate Passage or Passage Relationship proposed for review before it becomes visible in the Starfield Knowledge Map.
_Avoid_: Published passage, draft article

**Visible Passage**:
A reviewed Passage that is allowed to appear to Readers in the Starfield Knowledge Map.
_Avoid_: Suggestion, raw extraction

**Passage Review**:
The administrator decision to accept or hide Passage Suggestions before they can become Visible Passages. Review may happen in batches, but each Passage keeps its own review outcome.
_Avoid_: Article approval, automatic approval

**Relationship Type**:
A controlled label that explains why two Passages are connected for Readers.
_Avoid_: Free-form relation, hidden score

**Relationship Rationale**:
A short explanation of why a Passage Relationship is useful or meaningful for Readers. It is shown during review and can also explain visible connections in the Starfield Knowledge Map.
_Avoid_: Model trace, hidden prompt, confidence score

**Reader GraphRAG**:
A future reader-facing question-answering experience that answers from Visible Passages and reviewed Passage Relationships.
_Avoid_: Chatbot, generic AI answer, ungrounded answer

**Grounded Answer**:
A future answer to a Reader's question that is supported by Visible Passages and can point back to the source Articles.
_Avoid_: Summary, opinion, hallucinated answer

**GraphRAG-Ready Starfield**:
A Starfield Knowledge Map whose reviewed Passages and Passage Relationships retain enough source, rationale, and review context to support a future Reader GraphRAG experience.
_Avoid_: Current chatbot, model-only search
