# Pack change log

Newest round first. Say what changed and why, in a line or two per change.

## r05
- r04 unchanged, plus 33 new rows (20 include, 11 merge, 2 exclude), compiled by web search like r03 and r04; see `r05-research-log.md`. All new rows are `unverified`.
- Gods and defence of Roman Britain: the Walbrook and Carrawburgh mithraea, the Uley temple of Mercury, the Lydney temple of Nodens, Portchester shore fort, the "Barbarian Conspiracy" of 367 (a region).
- Picts, Scots, Britons and Wales: Dunadd, Burghead, Dun Nechtain 685 (a region covering both candidate sites), the Aberlemno stones, the siege of Dumbarton Rock 870, Dinas Powys, Eliseg's Pillar, the laws of Hywel Dda (low certainty; the manuscripts are 13th century).
- Mercia and the trading towns: Lundenwic, Hamwic, Ipswich and Ipswich ware, Brixworth, Offa's gold dinar (a region; mint and findspot unknown), the Lichfield Angel.
- Modern excavations and discoveries merged into their events. Excluded: the Fergus Mór founding legend of Dál Riata, and the modern claim that Offa converted to Islam.
- 16 pictures added with the rows. Five new journeys: Gods of Roman Britain, Defending the late Roman province, Picts, Scots and Britons, Wales and the west after Rome, Mercia and the trading towns.

## r04
- r03 unchanged, plus 20 new rows (17 include, 1 merge, 2 exclude), compiled by web search like r03; see `r04-research-log.md`. All new rows are `unverified`.
- Emperors in Britain: Hadrian's visit (122, a region), Severus's death at York (211), Carausius (286–287, a region), Constantine proclaimed at York (306), Constantine III (407, a region). These are the first events in the 122–284 phase.
- Rome in the north and written voices: Mons Graupius (a region; site unknown), Inchtuthil, the Bloomberg writing tablets, the Caerleon amphitheatre, the Silchester ogham stone. The Caerleon "Round Table" legend is excluded.
- Saints and Wessex: Iona (563), Lindisfarne founded (635), Wearmouth (674), the Jarrow dedication stone (685), Alfred at Athelney (878), the Alfred Jewel (with its 1693 discovery merged), the burh at Wallingford. The "burnt cakes" legend is excluded.
- Five new journeys built on these rows: Emperors in Britain, Rome's northern frontier, Voices from the past, Saints and scholars of the north, Alfred's kingdom.

## Pictures (images.json, outside the rounds)
- r04 events: 13 pictures added (coins of Hadrian, Carausius and Constantine III; the Severan family portrait; the modern Constantine statue at York; Inchtuthil from the air; Caerleon amphitheatre; Silchester's walls; Iona Abbey; Lindisfarne; Monkwearmouth; the Athelney monument; the Alfred Jewel). Still without one: Mons Graupius, the Bloomberg tablets, the Jarrow dedication stone and Wallingford, for want of a file with a confirmable licence and author.
- 19 more pictures, so 32 of the 38 included events now have one. Where no public-domain picture exists, openly licensed photographs (CC0, CC BY, CC BY-SA) are used and credited with author and licence on the card. Added a 1725 plan of the River Medway for the river battle of AD 43. Still without a picture: Water Newton, Lullingstone, Prittlewell, Rendlesham and Edington; Commons has candidate files for all but Prittlewell, but their exact file names and authors could not be confirmed by search.

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
