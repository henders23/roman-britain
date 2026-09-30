# Pack change log

Newest round first. Say what changed and why, in a line or two per change.

## r03
- First full research round: 50 rows (38 include, 6 merge, 6 exclude), compiled with web search. How each locator and picture was confirmed is in `r03-research-log.md`. Every row is still `unverified`: nobody has yet opened each locator at source.
- Existing rows: every `TO LOCATE` replaced with a real locator, and the "EXAMPLE ROW." reasons rewritten. Aquae Sulis window widened to 60–90 (a later Flavian date for the first temple has been argued). Tintagel imports window widened to 450–650 (some imported pottery has been re-dated later).
- New rows: the Claudian invasion (Richborough, the river battle, Camulodunum); Boudica's revolt (Mona, Camulodunum, Londinium, Verulamium, the final battle as a region); late Roman Christianity (Water Newton, Hinton St Mary, Mildenhall, Lullingstone); the end of Roman Britain (Hoxne, the Rescript of Honorius as a region); early kingdoms and conversion (Prittlewell, Augustine at Canterbury, Staffordshire, Rendlesham, Whitby, Bede at Jarrow); the Norse age (Lindisfarne 793, Repton, St Cuthbert's community, Edington and Brunanburh as regions, Cuerdale, Coppergate); and 1066 (Stamford Bridge, Pevensey, Hastings).
- Merges: the modern discoveries or excavations of Hoxne, Staffordshire, Repton, Cuerdale and Coppergate are folded into the events they evidence.
- Excludes: Hadrian's Wall, the Antonine Wall and Offa's Dyke (linear monuments the atlas cannot yet draw); the Boudica-at-King's-Cross legend; the Dun Cow legend of Durham.
- dataset.json: new kind `conflict` (battle, raid or revolt); all six chapter stories written (atlas synthesis).
- New files: `images.json` (13 public-domain pictures from Wikimedia Commons, each captioned; later imaginings are labelled as such) and eight journeys.

## r02
- Pack rows unchanged: r02 is a full copy of r01.
- dataset.json: phase boundaries no longer overlap. Each phase's `to` is now its last year, inclusive (43–121, 122–284, 285–409, 410–599, 600–792, 793–1066), so a boundary year such as 122 or 410 belongs to one phase only.
- dataset.json: default camera centre moved from [-2.5, 54.0] to [-2.5, 54.5], as the brief specifies.

## r01
- Template round with eight EXAMPLE rows showing each disposition, pins, date windows and interpretive uncertainty. Every row is unverified. Replace or verify them before any production build.
