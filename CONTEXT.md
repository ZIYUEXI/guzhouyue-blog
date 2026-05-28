# Guzhouyue Blog

This context describes the site-facing language for the Guzhouyue blog experience.

## Language

**Visual Style Preset**:
A site-wide appearance profile selected by the site owner.
_Avoid_: Theme, skin, mode

**Site Settings**:
Owner-controlled configuration that determines the default behavior and appearance of the public site.
_Avoid_: User preferences, local options

**Article**:
A dated blog entry that appears in public listings and can be opened as a standalone reading page.
_Avoid_: Page, note, document

**Post Composer**:
The owner-facing workspace used to create or edit an **Article**.
_Avoid_: Form, editor page, admin textarea

**Article Body Source**:
The Markdown text that is saved as the canonical body of an **Article**.
_Avoid_: Paragraph array, rendered HTML, rich text blob

**Rendered Article**:
The public reading view produced from an **Article Body Source**.
_Avoid_: Preview output, compiled content

**Note Section**:
A site-owned category used to group **Articles**.
_Avoid_: Tag, folder, channel

## Relationships

- **Site Settings** selects exactly one **Visual Style Preset**.
- A **Visual Style Preset** affects presentation only, not article content or navigation structure.
- An **Article** belongs to exactly one **Note Section**.
- A **Post Composer** edits exactly one **Article Body Source** at a time.
- A **Rendered Article** is derived from exactly one **Article Body Source**.

## Example Dialogue

> **Dev:** "Should a visitor be able to choose their own **Visual Style Preset**?"
> **Domain expert:** "No. The **Site Settings** choose the default style for the whole site."
>
> **Dev:** "Should the **Post Composer** save the preview HTML?"
> **Domain expert:** "No. Save the **Article Body Source** and derive the **Rendered Article** from it."

## Flagged Ambiguities

- "theme" previously referred to light and dark display mode in code, while the new requirement means **Visual Style Preset**. These are distinct concepts.
- "draft" is currently only button copy; the model has no draft/published distinction yet, so saved **Articles** are public content.
