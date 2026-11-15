# Nova Ember — Space Apps video credits and source record

This document records the assets used in `nova-ember-demo-v2.mp4` and the earlier `nova-ember-28s-draft.mp4`. When sharing the video elsewhere, carry these credits with it, including the music credit and license link.

## Music

**“Mesmerizing Galaxy” — Kevin MacLeod (incompetech.com)**
[Source and composer-provided attribution](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2300011) · [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) · ISRC USUAN2300011.

The track was trimmed, faded and mixed at reduced volume beneath the narration and sound effects. The earlier draft did not include this track.

## NASA visual material

- **Candle flames in normal gravity and microgravity**, NASA Glenn Research Center, image GRC-1998-C-00486. [NASA image page](https://images.nasa.gov/details/GRC-1998-C-00486) · [item-specific public-domain information](https://commons.wikimedia.org/wiki/File:Space_Fire.jpg). The normal-gravity side is cropped and held as a still; it depicts a candle, not a spacecraft cabin-material test.
- **Great Balls of Fire — FLEX**, Science@NASA and NASA's Goddard Space Flight Center. [NASA Scientific Visualization Studio item](https://svs.gsfc.nasa.gov/11318/) · [NASA SVS reuse information](https://svs.gsfc.nasa.gov/). NASA SVS states its content is public domain unless otherwise noted. The footage is trimmed and enlarged; its original audio is not used.

## NASA research and product material

- NASA's [Physical Sciences Informatics (PSI) database](https://science.data.nasa.gov/blog/psi-spotlight) supplies the research context. The visible examples include BASS-II, PSI-25 ([DOI 10.60555/4qc4-de67](https://doi.org/10.60555/4qc4-de67)), and FLEX, PSI-69 ([DOI 10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451)). The captured PSI study metadata identifies a CC0 1.0 license; individual linked materials should be checked separately before reuse.
- Product footage in version 2 was recorded by the project owner from the local Nova Ember application. Selected sections were cropped and cut; a still frame from the recording is held to show the source panel. The recording and app screens are not represented as being under a blanket Creative Commons license. The prior draft also uses local application captures. Nova Ember's source-code license is in the repository's [LICENSE](../../LICENSE).
- The captured assistant reply is labeled “Available results” and discusses BASS-II; it does not complete the requested two-experiment answer. The evidence panel shown identifies PSI-25 source metadata. The separate comparison view presents source-reported approaches; it does not establish that the experimental results are interchangeable.

## Production tools and type

The revised cut was assembled using [FFmpeg](https://ffmpeg.org/). The on-screen labels use DejaVu Sans and DejaVu Sans Mono. [DejaVu Fonts](https://dejavu-fonts.github.io/) builds on Bitstream Vera; its [font license](https://dejavu-fonts.github.io/License.html) includes the Bitstream copyright and permission notice and identifies DejaVu changes as public domain. The rendered video contains text, not a redistributed font file.

## Narration and sound

The narration was generated with OpenAI text-to-speech using the built-in Marin voice. The impacts and ticks were synthesized for the edit. No original NASA footage audio or screen-recording audio is used.

## Export and review

Version 2 is 28.00 seconds, 1920 × 1080, 60 fps, with H.264 video and AAC audio at approximately 18 Mbps overall. The file decoded successfully, its level was measured, and sampled frames were visually reviewed. The narration and music mix still need an independent listening review.

The 60 fps export and silent opening do not fit the installed vid-assembly EDL schema, which requires 30 fps and narration on each beat. The retained FFmpeg composition was used; this is not a claim that the skill's EDL renderer or final listening review passed.

## Metadata-attributed copy — 15 November 2026

`nova-ember-demo-v2-attributed.mp4` is a separate container-only remux of `nova-ember-demo-v2.mp4`. Its description and comment metadata identify the OpenAI text-to-speech narration and Marin voice; the comment also identifies the music, its CC BY 4.0 license, the edits, and this credit record. The original file remains available. The video and audio packet SHA-256 hashes were compared packet by packet and matched; FFmpeg decoded both streams in the remux successfully. The remux has SHA-256 `331ca25ec241eb3eab6e848e89a6622edcaffc5113f5f779798aacbdfb7cbb37`.

A hosting platform may strip or replace file metadata. Include the [copy-ready description](demo-v2-public-credits.txt) with the uploaded video and verify its published text; the metadata does not replace the music attribution, license link and changes notice or other source credits on the public page. The remux does not establish an independent listening review or public upload.
