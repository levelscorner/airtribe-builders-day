# Vendored chotu-craft prompt skills

**Source:** [github.com/levelscorner/chotu-craft](https://github.com/levelscorner/chotu-craft) (Abhinav / levelscorner).

This environment could not read that repo. `gh api repos/levelscorner/chotu-craft` returned 404, and the repo is not in the visible `levelscorner` repository list. These `SKILL.md` files are **placeholders** so the skill router has a folder to load. They are not the private craft text.

When the real repo is available, replace `skills/` here with its prompt-creation skills and templates (`skills/*/SKILL.md` and `references/`). docs/13 §9 names the files the studio expects:

| Stage | chotu-craft path |
|---|---|
| Script | `skills/script-per-genre/SKILL.md` plus genre references |
| Image prompt | `skills/image-prompt/SKILL.md` |
| Motion prompt | `skills/video-prompt/SKILL.md` |
| Voiceover | `skills/sound/SKILL.md` |

The router in `../router.ts` reads this folder by genre (kids edu-fun, ads, faceless) and stage (script, image prompt, motion prompt, voiceover). Skill text stays on the server.
