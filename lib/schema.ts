import { z } from "zod";

// Limits live in .describe() (guidance for the model) and are enforced by lib/validate.ts.
export const LIMITS = {
  xPost: 280,
  xPostsMin: 4,
  xPostsMax: 6,
  googleHeadline: 30,
  googleDescription: 90,
  googleHeadlinesMin: 3,
  googleHeadlinesMax: 5,
  metaHeadline: 40,
  metaPrimary: 400,
};

const ids = z.array(z.string()).describe("IDs of the facts (e.g. F3) that support the claims in this asset");

export const PlanSchema = z.object({
  angle: z.string().describe("One sentence: the content angle for this topic"),
  audience: z.string().describe("Who this pack is for, e.g. D2C founders in India"),
  keyMessage: z.string().describe("The single message every asset should land"),
  factIds: z.array(z.string()).describe("3 to 6 fact IDs that best support the angle"),
  newsTakeaways: z.array(z.string()).describe("Up to 3 takeaways from the news article, empty if no article"),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PackSchema = z.object({
  blog: z.object({
    title: z.string(),
    body: z.string().describe("300 to 400 words, short paragraphs separated by blank lines, ends with the free audit CTA"),
    factIds: ids,
  }),
  linkedin: z.object({
    post: z.string().describe("About 120 to 180 words, line breaks between short paragraphs, first-person plural voice"),
    factIds: ids,
  }),
  xThread: z.object({
    posts: z.array(z.string()).describe("4 to 6 posts, EACH at most 280 characters, numbered like 1/5"),
    factIds: ids,
  }),
  instagram: z.object({
    caption: z.string().describe("Caption under 150 words, line breaks allowed, no hashtags inside"),
    hashtags: z.array(z.string()).describe("6 to 12 hashtags, each starting with #"),
    factIds: ids,
  }),
  metaAds: z
    .array(
      z.object({
        angle: z.enum(["proof-led", "offer-led", "pain-led"]),
        primaryText: z.string().describe("Under 400 characters"),
        headline: z.string().describe("At most 40 characters"),
        description: z.string().describe("At most 30 characters"),
        cta: z.string().describe("Button label, e.g. Book Now, Learn More"),
        factIds: ids,
      }),
    )
    .describe("EXACTLY 3 ads: one proof-led, one offer-led, one pain-led"),
  googleAds: z
    .array(
      z.object({
        headlines: z.array(z.string()).describe("3 to 5 headlines, EACH at most 30 characters"),
        descriptions: z.array(z.string()).describe("EXACTLY 2 descriptions, EACH at most 90 characters"),
        factIds: ids,
      }),
    )
    .describe("EXACTLY 3 responsive search ad variations"),
  image: z.object({
    channel: z.enum(["Instagram", "LinkedIn", "Meta ad", "Blog header"]),
    aspectRatio: z.enum(["1:1", "4:5", "16:9"]),
    concept: z.string().describe("2 sentences: what the visual shows and why it fits AdPilot and the channel"),
    prompt: z.string().describe("Detailed image-generation prompt: subject, setting, style, lighting, colours, composition. Must say: no text, no letters, no logos"),
    altText: z.string(),
  }),
});
export type Pack = z.infer<typeof PackSchema>;

export type Flag = {
  severity: "error" | "warning";
  asset: "blog" | "linkedin" | "xThread" | "instagram" | "metaAds" | "googleAds" | "image" | "pack";
  path: string;
  message: string;
};

export const ASSETS = [
  { key: "blog", label: "Blog" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "xThread", label: "X thread" },
  { key: "instagram", label: "Instagram" },
  { key: "metaAds", label: "Meta ads" },
  { key: "googleAds", label: "Google ads" },
  { key: "image", label: "Image" },
] as const;
export type AssetKey = (typeof ASSETS)[number]["key"];
