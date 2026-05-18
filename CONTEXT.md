# Guzhouyue Blog

This context describes the site-facing language for the Guzhouyue blog experience.

## Language

**Visual Style Preset**:
A site-wide appearance profile selected by the site owner.
_Avoid_: Theme, skin, mode

**Site Settings**:
Owner-controlled configuration that determines the default behavior and appearance of the public site.
_Avoid_: User preferences, local options

## Relationships

- **Site Settings** selects exactly one **Visual Style Preset**.
- A **Visual Style Preset** affects presentation only, not article content or navigation structure.

## Example Dialogue

> **Dev:** "Should a visitor be able to choose their own **Visual Style Preset**?"
> **Domain expert:** "No. The **Site Settings** choose the default style for the whole site."

## Flagged Ambiguities

- "theme" previously referred to light and dark display mode in code, while the new requirement means **Visual Style Preset**. These are distinct concepts.
