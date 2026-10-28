// Single source of truth for which Claude model the agency's chat/completion
// edge functions call. Added after web-dev-discovery-chat was found still
// pinned to the retired `claude-sonnet-4-20250514` snapshot while every
// sibling chat function had already moved to `claude-sonnet-4-5` — each
// function hardcoded its own copy of the model string, so they silently
// drifted apart. Change it here once; every importer picks it up.
export const CLAUDE_MODEL = "claude-sonnet-4-5";
