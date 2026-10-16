// World names: every seed (a uint32) has a name of its own, and the name gives the seed back.
//   The Sunken Vale of Ravenmere
//   The <adjective> <landmark> of <prefix><suffix>
// A friend can type the name into "New Known World" and gets the same world.
//
// The seed is first stirred (mix: an xorshift-multiply hash, every step of it can be undone, so
// seeds 1, 2, 3 get names nothing alike), then read as a number in four digits of mixed sizes:
// 512 adjectives x 256 landmarks x 512 prefixes x 64 suffixes = 2^32, one name for each seed.
// Reading a name does it backwards (seedFromName).
//
// The words are picked by hand: single words, no word in two places, nothing rude, also not
// where a prefix meets a suffix (tests/names.test.js checks it). Where three letters would be the
// same the join keeps two ("Moss" + "stone": "Mosstone"); every join still reads only one way.
// The lists are fixed: a changed word renames every world that has it (the world stays, its seed
// is what is saved) and its old name, typed in, no longer finds it. Only swap a word that must go.

const words = s => s.trim().split(/\s+/);

export const ADJECTIVES = words(`
Misty Foggy Windy Stormy Rainy Snowy Frosty Icy Sunny Cloudy Hazy Murky Gloomy Shady Shadowed Dim Dusky Twilit
Moonlit Starlit Sunlit Bright Glowing Shining Glinting Sparkling Shimmering Flickering Smoldering Burning
Blazing Fiery Scorched Charred Ashen Smoky Sooty Frozen Chilly Wintry Snowbound Thawing Dripping Damp Soggy
Boggy Marshy Muddy Sandy Dusty Rocky Stony Pebbly Craggy Jagged Steep Sheer Lofty Towering Deep Shallow
Bottomless Endless Vast Wide Narrow Winding Twisting Crooked Tangled Knotted Gnarled Rooted Overgrown Leafy
Mossy Grassy Ferny Flowering Blooming Thorny Brambly Wooded Wild Verdant Lush Green Amber Azure Crimson
Scarlet Golden Silver Copper Bronze Iron Ivory Ebony Jade Emerald Sapphire Ruby Violet Indigo Cobalt Russet
Rusty Tawny Ochre Umber Sable Pale Grey White Black Red Blue Brown Purple Rosy Opal Pearly Glassy Crystal
Marble Ancient Elder Old Forgotten Lost Hidden Secret Silent Quiet Whispering Echoing Humming Singing Howling
Roaring Rumbling Thundering Murmuring Sleeping Dreaming Restless Wandering Drifting Floating Sunken Drowned
Fallen Broken Shattered Cracked Crumbling Ruined Abandoned Haunted Enchanted Charmed Blessed Sacred Hallowed
Gilded Jeweled Painted Carved Woven Chained Locked Sealed Buried Forsaken Lonely Lonesome Distant Northern
Southern Eastern Western Barren Parched Sleepy Drowsy Merry Jolly Cheerful Gentle Brave Bold Proud Noble Royal
Humble Grim Stern Fierce Feral Crafty Clever Wise Curious Peculiar Strange Wondrous Marvelous Mysterious
Hushed Muffled Velvet Silken Feathered Furry Scaly Horned Tusked Spiny Prickly Bristly Shaggy Woolly Tufted
Speckled Spotted Striped Dappled Mottled Freckled Great Grand Little Tiny Giant Mighty Warm Cold Cool Balmy
Sweet Fragrant Tumbling Rolling Sliding Shifting Crawling Creeping Leaping Dancing Spinning Swirling Rippling
Bubbling Boiling Steaming Seething Churning Trickling Flowing Rushing Glimmering Radiant Luminous Dazzling
Brilliant Dark Shadowy Sombre Dreary Bleak Desolate Secluded Remote Isolated Sheltered Peaceful Tranquil
Serene Drowsing Slumbering Brooding Watching Gazing Twinkling Glittering Crackling Hissing Buzzing Chiming
Booming Swaying Soaring Gliding Hovering Fluttering Flapping Rustling Creaking Weathered Mossgrown Cobwebbed
Chalky Swampy Veiled Cloaked Hooded Shrouded Clouded Tattered Ragged Frayed Threadbare Hoary Grizzled
Venerable Primeval Timeless Ageless Eternal Fading Waning Waxing Sinking Roaming Rambling Meandering Lively
Rugged Lustrous Burnished Honeyed Grumpy Lurking Prowling Stalking Skulking Questing Seeking Guarding Warding
Swarming Looming Lingering Vanishing Rising Galloping Marching Ringing Gnawing Wishing Undying Plunging
Giggling Laughing Yawning Growling Bewitched Spellbound Starry Windswept Sunbaked Rainswept Moonstruck Thorned
Breezy Blustery Dewy Sodden Gloaming Midnight Ghostly Spectral Eerie Uncanny Sly Cunning Sneaky Tricky
Puzzling Riddling Secretive Silvery Coppery Rusted Flowered Blossomed Bountiful Stalwart Valiant Gallant
Heroic Daring Fearless Dauntless Steadfast Unseen Unknown Uncharted Untamed Unbroken Untrodden Boundless
Frothy Foamy Molten Glowering Scalding Searing Sweltering Frigid Biting Glacial Arctic Polar Boreal Alpine
Upper Lower Inner Outer Middle High Low Far Dry Bare Empty Snug Cozy Smooth Gleaming Climbing Feasting Primal
Rippled Shimmery Sparkly Glittery Rich Plentiful Fruitful Loyal Faithful Trusty Gusty Salted Glazed Crisp Worn
Aged Shiny Reedy Heathery Spiral Coiled Knotty Braided Twined Hulking Lumbering Restful Hearty Delicate Swift
Flowery Frosted Polished Tarnished Melting Freezing Forging Crunching Fizzing Sparking Flashing Blinking
Winking Peering Diving Lazy Hungry Weary Busy Idle Slow Calm Still Placid Hopping Mellow Briny Fabled Storied
Mythic Legendary Faraway Nameless Sunless Starless Bouncing Skipping Purring Chirping Tinkling Jingling
Moonless Windblown Snowcapped Glistening Sunwarmed Opaline Gossamer
`);
export const LANDMARKS = words(`
Vale Barrow Hollow Halls Steps Deeps Reach Crag Glen Warren Keep Burrow Fen Spire Grotto Ridge Pits Wilds Nook
Rift Moor Caverns Caves Tunnels Mines Delves Depths Vaults Crypts Tombs Catacombs Cellars Dungeons Gardens
Groves Woods Forest Thicket Glade Meadow Fields Heath Downs Dales Dells Gorge Canyon Ravine Chasm Abyss Gulch
Gully Cliffs Bluffs Heights Peaks Summit Tors Fells Hills Mounds Knolls Dunes Flats Plains Steppes Marsh Swamp
Bog Mire Wetlands Shallows Pools Springs Falls Rapids Lakes Lagoon Shore Strand Coast Cove Bay Isles Atoll
Reef Shoals Sands Wastes Badlands Barrens Expanse Frontier Marches Valley Basin Crater Caldera Vents Forges
Foundry Smithy Kilns Furnaces Quarry Diggings Shafts Galleries Chambers Corridors Passages Labyrinth Maze
Tangle Roots Dens Lairs Nests Hives Roost Eyrie Stables Towers Turrets Citadel Fortress Castle Bastion
Ramparts Walls Gates Bridges Arches Terraces Stairs Ruins Remnants Relics Monoliths Stones Circle Rings Henge
Cairns Sanctum Shrine Temple Cloister Abbey Priory Palace Throne Harbor Orchard Brink Crest Maw Crown Cradle
Hearth Haven Sanctuary Lookout Beacon Spires Needles Pinnacles Ledges Slopes Oasis Mesa Butte Plateau
Highlands Lowlands Uplands Hinterland Wildwood Greenwood Undercroft Bower Arbor Copse Holt Hurst Weald Wold
Combe Boulders Outcrop Headland Inlet Delta Fjord Sound Narrows Straits Fords Crossing Causeway Overlook
Overhang Alcove Cleft Crevice Fissure Lode Vein Hoard Treasury Armory Granary Watermill Windmill Dovecote
Aviary Lodge Manor Court Library Archives Wells Fountains Retreat Refuge Bazaar Arena Tundra Glacier Floes
Icefield Snowfield Pass Hideout Heart Fringe Hedges Pastures Vineyard Aqueduct Cisterns Baths Coppice Spinney
Dingle Sinkhole Locks Weirs Thickets Channels Estuary Peninsula Jungle Savanna Prairie Briars
`);
export const PREFIXES = words(`
Ash Oak Elm Birch Rowan Willow Alder Hazel Holly Ivy Fern Moss Thorn Briar Heather Bracken Reed Rush Sedge
Clover Thistle Nettle Bramble Yew Pine Fir Larch Cedar Maple Linden Poplar Aspen Hawthorn Juniper Laurel
Myrtle Sage Mint Rose Lily Iris Daisy Poppy Tulip Lavender Saffron Mallow Sorrel Tansy Yarrow Vetch Gorse
Broom Sloe Damson Apple Pear Plum Cherry Berry Hop Barley Wheat Oat Rye Bean Raven Crow Rook Wren Robin Finch
Lark Swan Heron Crane Hawk Falcon Eagle Owl Kite Merlin Kestrel Osprey Gull Tern Swallow Martin Starling
Thrush Linnet Sparrow Jay Magpie Gander Goose Drake Teal Plover Curlew Snipe Stork Wolf Fox Bear Boar Badger
Otter Stoat Hare Deer Stag Hart Elk Bison Ox Ram Lynx Lion Frog Newt Adder Pike Trout Salmon Carp Perch Bee
Iron Copper Tin Silver Gold Brass Bronze Steel Flint Slate Chalk Clay Coal Salt Glass Amber Jade Opal Ruby
Pearl Coral Jet Onyx Quartz Marble Granite Ember Cinder Smoke Fire Flame Frost Ice Snow Hail Rain Mist Fog
Cloud Storm Thunder Wind Gale Sun Moon Star Dawn Dusk Night Russet Bell Horn Crown King Queen Knight Bow Arrow
Sword Shield Helm Spear Axe Hammer Anvil Forge Torch Cauldron Rope Chain Gem Rune Feather Wing Claw Fang Tusk
Antler Hoof Scale Shell Root Bough Branch Leaf Bark Acorn Bloom Petal Tangle Bog Hill Crag Cave Mound Cairn
Henge Knoll Tower Loom Spindle Banner Harp Echo Whisper Song Chime Honey Apricot Quince Elder Beech Thyme
Fennel Gannet Lapwing Bittern Egret Mallard Eider Wagtail Dipper Nuthatch Cuckoo Nightjar Oriole Warbler
Blackcap Wheatear Redstart Marten Weasel Black White Grey Red Green Blue Brown Scarlet Crimson Azure Indigo
Violet Umber Ochre Sable Ebony Ivory Smith Miller Fisher Hunter Archer Baker Mason Carter Fletcher Shepherd
Hermit Lamb Mare Pony Colt Horse Goat Bull Cat Hound Spring Stream Creek Pond Lake River Door Stair Step Ledge
Pillar Arch Mount Key Lock Tale Saga Riddle Luck Hope Dream Wish Spell Charm Hornet Moth Seal Puffin Butter
Grape Fig Olive Almond Walnut Chestnut Hornbeam Turnip Pumpkin Winter Summer Autumn Harvest Yule Thaw Dew Rime
Sleet Gloom Shadow Glimmer Gleam Glow Spark Blaze Soot Dust Sand Pebble Boulder Dragon Wyrm Wyvern Griffin
Troll Giant Goblin Gnome Pixie Sprite Elf Dwarf Wizard Witch Druid Bard Seer Oracle Rover Ranger Warden Herald
Jester Minstrel Tinker Unicorn Phoenix Kraken Hydra Ghost Spirit Comet Sky Rainbow Cobalt Agate Jasper Garnet
Emerald Diamond Crystal Spruce Hemlock Cypress Sycamore Mulberry Bluebell Snowdrop Primrose Cowslip Foxglove
Marigold Lupin Aster Orchid Peony Dahlia Pansy Lilac Jasmine Pheasant Quail Grouse Buzzard Harrier Goshawk
Fawn Doe Roe Viper Serpent Wheel Boat Ship Sail Anchor Lamp Orb Glade Grove Dell Heath Barrow Hollow Spire Tor
Ring Isle Cove Bay Shore Sea Tide Wave Foam Reef Kelp Brine Dune Noon Eve Day Long Broad Fair Bright Dark Cold
Old New High Deep North South East West Nether Over Under Still Clear Sweet Wild Great Little Ogre Imp Golem
Topaz Beryl Fay Hay Straw Wool Flax Silk Corn Earl Duke Prince Abbot Friar Monk Gust Haze Breeze Tar Wax Toad
Crab Beetle Coin Lantern Candle Drum Pipe
`);
export const SUFFIXES = words(`
mere wick hold fell dale moor ford stead holm thorpe by ton bury crest gate haven reach watch field wood worth
ley ham hurst combe cote den don garth gill bourne low mouth ness pool shaw stow thwaite wold well brook
bridge burn cliff croft cross fall fen hall chester marsh mead mill peak rock shire side stone vale wall water
ridge mire gard
`);

// --- stirring the seed ---------------------------------------------------------------------------

const M1 = 0x7feb352d, M2 = 0x846ca68b;
// the multiplicative inverse mod 2^32 of an odd number (Newton's method: the right bits double each step)
function inverse(a) {
  let x = a;
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(a, x));
  return x;
}
const I1 = inverse(M1), I2 = inverse(M2);

export function mix(x) {
  x ^= x >>> 16; x = Math.imul(x, M1);
  x ^= x >>> 15; x = Math.imul(x, M2);
  x ^= x >>> 16;
  return x >>> 0;
}
export function unmix(x) {
  x ^= x >>> 16; x = Math.imul(x, I2);
  x ^= (x >>> 15) ^ (x >>> 30); x = Math.imul(x, I1);
  x ^= x >>> 16;
  return x >>> 0;
}

// --- names ---------------------------------------------------------------------------------------

const join = (prefix, suffix) => (prefix + suffix).replace(/(.)\1\1/g, '$1$1');

// the four word numbers of a seed: [adjective, landmark, prefix, suffix]
function digits(seed) {
  const n = mix(seed >>> 0);
  return [n >>> 23, n >>> 15 & 255, n >>> 6 & 511, n & 63];
}

// 'The Sunken Vale of Ravenmere'
export function worldName(seed) {
  const [a, l, p, s] = digits(seed);
  return `The ${ADJECTIVES[a]} ${LANDMARKS[l]} of ${join(PREFIXES[p], SUFFIXES[s])}`;
}
// just the place: 'Ravenmere'
export function worldPlace(seed) {
  const [, , p, s] = digits(seed);
  return join(PREFIXES[p], SUFFIXES[s]);
}

// the lookups for reading a name, made the first time one is read
let lookup = null;
function lookups() {
  if (lookup) return lookup;
  const index = list => new Map(list.map((w, i) => [w.toLowerCase(), i]));
  const places = new Map();
  PREFIXES.forEach((p, i) => SUFFIXES.forEach((s, j) => places.set(join(p, s).toLowerCase(), [i, j])));
  return lookup = { adjectives: index(ADJECTIVES), landmarks: index(LANDMARKS), places };
}

// The seed of a world name as typed: big or small letters, any spaces, "the" and "of" may be
// left out, and so may a number after it ("... II": a second copy of it, core/save.js).
// null: not a world name.
export function seedFromName(text) {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && w !== 'the' && w !== 'of');
  if (t.length === 4 && /^([ivx]+|\d+)$/.test(t[3])) t.pop();
  if (t.length !== 3) return null;
  const { adjectives, landmarks, places } = lookups();
  const a = adjectives.get(t[0]), l = landmarks.get(t[1]), ps = places.get(t[2]);
  if (a === undefined || l === undefined || !ps) return null;
  return unmix((a << 23 | l << 15 | ps[0] << 6 | ps[1]) >>> 0);
}

// A seed as typed in "New Known World": a number (0 to 2^32 - 1) or a world name. null: neither.
export function readSeed(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (/^\d{1,10}$/.test(t)) return Number(t) <= 0xffffffff ? Number(t) : null;
  return seedFromName(t);
}
