# Nova Ember — Space Apps video credits and source record

The selected final demo is [nova-ember-demo-final.mp4](nova-ember-demo-final.mp4), the version 3 motion-graphics revision. Use the [final public credits](demo-final-public-credits.txt) when sharing it. Earlier v2 and draft files are superseded and retained for history. This document records the sources and licenses for all these versions.

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

## Version 2 production tools and type (superseded)

The revised cut was assembled using [FFmpeg](https://ffmpeg.org/). The on-screen labels use DejaVu Sans and DejaVu Sans Mono. [DejaVu Fonts](https://dejavu-fonts.github.io/) builds on Bitstream Vera; its [font license](https://dejavu-fonts.github.io/License.html) includes the Bitstream copyright and permission notice and identifies DejaVu changes as public domain. The rendered video contains text, not a redistributed font file.

## Narration and sound

The narration was generated with OpenAI text-to-speech using the built-in Marin voice. The impacts and ticks were synthesized for the edit. No original NASA footage audio or screen-recording audio is used.

## Version 2 export and review (superseded)

Version 2 is 28.00 seconds, 1920 × 1080, 60 fps, with H.264 video and AAC audio at approximately 18 Mbps overall. The file decoded successfully, its level was measured, and sampled frames were visually reviewed. The narration and music mix still need an independent listening review.

The 60 fps export and silent opening do not fit the installed vid-assembly EDL schema, which requires 30 fps and narration on each beat. The retained FFmpeg composition was used; this is not a claim that the skill's EDL renderer or final listening review passed.

## Metadata-attributed copy — 15 November 2026

`nova-ember-demo-v2-attributed.mp4` is a separate container-only remux of `nova-ember-demo-v2.mp4`. Its description and comment metadata identify the OpenAI text-to-speech narration and Marin voice; the comment also identifies the music, its CC BY 4.0 license, the edits, and this credit record. The original file remains available. The video and audio packet SHA-256 hashes were compared packet by packet and matched; FFmpeg decoded both streams in the remux successfully. The remux has SHA-256 `331ca25ec241eb3eab6e848e89a6622edcaffc5113f5f779798aacbdfb7cbb37`.

A hosting platform may strip or replace file metadata. Include the [copy-ready description](demo-v2-public-credits.txt) with the uploaded video and verify its published text; the metadata does not replace the music attribution, license link and changes notice or other source credits on the public page. The remux does not establish an independent listening review or public upload.


## Final demo — version 3, 15 November 2026

The selected deliverable is **[nova-ember-demo-final.mp4](nova-ember-demo-final.mp4)**. It supersedes the earlier demo cuts for current README and submission references. The word final identifies the selected master; it does not establish a public upload or independent listening acceptance.

- **Motion graphics:** rebuilt with large masked type reveals, a clear title grid, circular NASA flame framing, tighter real product crops and a clean closing lockup. The source panel and comparison include explicit still-frame holds from the owner's recording. Scientific imagery is cropped and framed; the decorative rings are graphic elements, not measurements.
- **Type and tools:** Inter and IBM Plex Mono, SIL Open Font License 1.1. The existing [Inter notice](../../apps/web/public/licenses/inter-OFL.txt) and [IBM Plex Mono notice](../../apps/web/public/licenses/ibm-plex-mono-OFL.txt) remain with the application. The local composition also carries copies beside its font files. Motion was rendered with HyperFrames 0.9.52, upgraded from 0.8.79 and checked on the new version; final encoding and mixing used FFmpeg. Font notices apply to font redistribution; the MP4 contains rendered text.
- **Sound:** the same OpenAI Marin narration is retained. The music baseline is approximately 10.7 dB below the v2 setting, with additional ducking during speech; effects are softer and the bed fades out at the end. No new music or voice license is implied. The CC BY 4.0 music credit above continues to apply.
- **Export:** 28.000 seconds; 1920 × 1080; 60 fps; H.264/AAC; approximately 18.10 Mbps. SHA-256: `782132b918a0993b861739c6f74a3f0f738fa5fc164d8578e2d7d09d4c7396d7`.
- **Checks:** the final file fully decoded without errors. Measured integrated loudness is −16.2 LUFS and true peak is −3.5 dBTP. HyperFrames runtime, layout, motion, contrast and audio checks report no errors; structural timeline warnings remain. Rendered key frames, dense opening/closing samples and corrected Send-button framing were visually inspected. These are sampled visual checks; uninterrupted playback and an independent listening review remain unverified.
- **Disclosure and distribution:** MP4 title metadata identifies the final demo; description and comment metadata identify the OpenAI voice and the music source/license. Include [demo-final-public-credits.txt](demo-final-public-credits.txt) on the public video page because hosting may strip metadata. NASA, music and project assets retain their actual individual rights; the film does not assign a blanket Creative Commons license to everything.
