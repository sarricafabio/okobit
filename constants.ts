

export const HERO_PROMPTS = [
  // Absurd & Creative
  "A depressed robot drinking motor oil at a bar",
  "Gothic architecture made entirely of cheese",
  "A cyberpunk street food vendor selling bioluminescent noodles",
  "Portrait of a cat general in Napoleon's army",
  "An underwater city inside a giant jellyfish",
  "A hamster leading a boardroom meeting",
  "A transparent piano filled with water and goldifsh",
  "Knitted wool car driving on a denim highway",
  "An astronaut meditating on a floating rock in a nebula",
  "A library where the books are flying like birds",
  "A dragon made of clouds during sunset",
  "A vending machine selling bottled dreams",
  "A tree growing lightbulbs instead of fruit",
  "A Victorian mansion on the back of a giant turtle",
  "A samurai slicing through a raindrop",
  
  // Style & Rendering
  "Isometric view of a cozy magical potion shop",
  "A futuristic sneaker design, 8k resolution, product photography",
  "Oil painting of a rainy street in Tokyo, impasto style",
  "Low poly fox running through a digital forest",
  "Macro shot of a mechanical eye",

  // Editing & Transformation (User instructions)
  "Edit this photo to make it look like a 1980s VHS tape",
  "Remove the background and replace it with a tropical beach",
  "Turn this sketch into a photorealistic image",
  "Make the lighting in this image dramatic and moody",
  "Change the season in this photo from summer to winter",
  "Add a neon sign that says 'OKOBIT' in the background",
  "Colorize this black and white photo",
  "Make the subject look like a claymation character",
  "Apply a cyberpunk filter to this image",
  "Swap the sky for a galaxy view"
];

export const ASPECT_RATIOS = [
  { label: "Auto Aspect", value: "auto" },
  { label: "1:1 Square", value: "1:1" },
  { label: "16:9 Wide", value: "16:9" },
  { label: "9:16 Portrait", value: "9:16" },
  { label: "4:3 Standard", value: "4:3" },
  { label: "3:4 Vertical", value: "3:4" },
];

export const RESOLUTIONS = [
  { label: "1K (1024x1024)", value: "1K" },
  { label: "2K (2048x2048)", value: "2K" },
  { label: "4K (4096x4096)", value: "4K" },
];

export const DB_NAME = 'OkobitDB_v1';

export const SAFETY_SETTINGS = [
  { label: "None (Experimental)", value: "BLOCK_NONE" },
  { label: "Low", value: "BLOCK_ONLY_HIGH" },
  { label: "Standard", value: "BLOCK_MEDIUM_AND_ABOVE" },
  { label: "Strict", value: "BLOCK_LOW_AND_ABOVE" },
];