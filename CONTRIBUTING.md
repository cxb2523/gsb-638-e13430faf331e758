# Contributing

Thanks for taking a look. Issues and pull requests are welcome, from bug reports to whole new scenes.

## Setup

There's no install or build step. Clone the repo, run `python3 tools/serve.py` and open http://localhost:5184 in Chrome or Edge. Edit any file and reload.

For review images, also run `python3 tools/save-endpoint.py`. The console tools (`__pixel.sheet`, `__pixel.still`, `__pixel.kit`) then write PNG and MP4 files into `exports/`, which git ignores.

## New scenes

1. Copy `scenes/placeholder.js` (a plain grass block) or one of the finished scenes, and give it a name.
2. Register it in `SCENES` in `app.js`. Add a storyboard to `CLIPS` if you want a demo clip on G.
3. Follow "Making a scene" in the README: build solid things with `toon()` so they react to light and weather, and keep the frame under 16 ms.
4. Check every time of day and every weather, not just the default.

Scenes should be original. No text, real logos or brands inside a scene, and no copies of other artists' work.

## Pull requests

- Keep each pull request to one feature or fix.
- Plain ES modules. Open an issue before adding a dependency or a build tool.
- Check the browser console for errors and look at the scene in a few states before you open the PR. A screenshot helps.
- By contributing, you agree that your work is released under this project's MIT license.
