// Demo mode: a recorded run for the sample topic, used when there is no API key,
// when the network is down, or when "Demo" is toggled in the UI.
// The draft deliberately contains 3 real failure types so the revise loop has work to do.
import type { Pack, Plan } from "./schema";

export const MOCK_PLAN: Plan = {
  angle: "Boosted posts buy reach, not results — show D2C founders what happens when the same money goes into campaigns built for one outcome.",
  audience: "D2C founders and marketing leads in India spending on Instagram and Facebook",
  keyMessage: "Same budget, built for results: AdPilot's clients got more enquiries and cheaper leads by moving away from boosting.",
  factIds: ["F6", "F3", "F5", "F7", "F12"],
  newsTakeaways: [],
};

const BLOG = `Every D2C founder has done it. A post does well, the Boost button is right there, and a few thousand rupees later you have likes from people who will never buy.

Boosting is built for reach. Reach is not the goal. Sales and enquiries are.

What boosting gets wrong

A boosted post optimises for engagement by default. It does not test audiences. It does not retarget the people who visited your site. It does not tell you which creative actually sold. You pay for attention and hope it turns into revenue.

What changes when the same money is built for results

One of our clients, a coaching centre, was spending on boosted posts. We moved the same budget into lead-form campaigns with WhatsApp follow-up. Monthly enquiries went from 1x to 3x. Same spend. Different setup.

A skincare D2C brand came to us with an account that had grown without a plan. We rebuilt it around 3 audiences and refreshed creatives every week. In 90 days, ROAS rose from 2.1 to 3.4.

For a dental clinic chain across 4 cities, the fix was on Google: search campaigns by locality, call tracking and a faster booking page. Cost per lead fell from ₹420 to ₹260.

The pattern

None of these wins came from spending more. They came from three habits:

- Pick one target number per month and build every campaign around it.
- Test audiences instead of guessing.
- Refresh creative weekly so performance does not decay.

How we work

We start with an audit and show you where money is being wasted. We agree one target. Campaigns go live within 10 working days. You get a weekly WhatsApp update, a monthly call, and you own the ad account. No black box. No long lock-in.

Start with the audit

If you are boosting posts and not sure what it is returning, book a free 30-minute ad account audit. You get a written report showing where the spend is leaking and what we would change first.`;

export const MOCK_DRAFT: Pack = {
  blog: { title: "Stop Boosting Posts: Where Your D2C Ad Spend Actually Goes", body: BLOG, factIds: ["F6", "F3", "F5", "F10", "F11", "F12"] },
  linkedin: {
    post: `Most D2C brands lose up to 40% of their ad budget on boosted posts.

The Boost button is easy. That is the problem. It buys reach, and reach does not pay salaries.

Here is what happened when one of our clients, a coaching centre, stopped boosting.

We moved the same budget into lead-form campaigns with WhatsApp follow-up. Monthly enquiries went from 1x to 3x. No extra spend.

Another client, a skincare D2C brand, went from a ROAS of 2.1 to 3.4 in 90 days after we rebuilt the account around 3 audiences and weekly creatives.

The lesson is simple: decide the one number you want each month, then build campaigns for that number.

If you want to see where your spend is leaking, we offer a free 30-minute ad account audit with a written report.`,
    factIds: ["F6", "F3", "F12"],
  },
  xThread: {
    posts: [
      "1/5 Boosting a post feels like marketing. Most of the time it is paying for likes from people who will never buy. A thread on what to do instead.",
      "2/5 A coaching centre we work with moved spend from boosted posts to lead-form campaigns with WhatsApp follow-up. Same budget. Monthly enquiries went from 1x to 3x.",
      "3/5 A skincare D2C brand: we rebuilt the account around 3 audiences with weekly UGC-style creatives. ROAS went from 2.1 to 3.4 in 90 days.",
      "4/5 The pattern: one target number per month, audiences tested not guessed, creative refreshed every week. Spend did not go up. The setup changed.",
      "5/5 Not sure what your boosted posts return? Book a free 30-minute ad account audit with AdPilot Media. You get a written report.",
    ],
    factIds: ["F6", "F3", "F10", "F12"],
  },
  instagram: {
    caption: `Boosted ≠ built for results.

The Boost button buys reach. Your business needs enquiries and sales.

A coaching centre we work with moved the same budget from boosted posts to lead-form campaigns with WhatsApp follow-up. Enquiries went from 1x to 3x a month.

Want to know what your boosts are really returning? Free 30-minute ad account audit with a written report. Link in bio.`,
    hashtags: ["#D2CIndia", "#PerformanceMarketing", "#MetaAds", "#InstagramAds", "#AdSpend", "#SmallBusinessIndia", "#Ahmedabad", "#DigitalMarketing"],
    factIds: ["F6", "F12"],
  },
  metaAds: [
    {
      angle: "proof-led",
      primaryText: "A coaching centre stopped boosting posts. Same budget, moved into lead-form campaigns with WhatsApp follow-up. Monthly enquiries went from 1x to 3x. That is what campaigns built for results do.",
      headline: "Same budget. 3x the enquiries.",
      description: "Real client result",
      cta: "Learn More",
      factIds: ["F6"],
    },
    {
      angle: "offer-led",
      primaryText: "Not sure where your ad money goes? Get a free 30-minute audit of your Meta or Google ad account. We show you where spend is wasted, in a written report. No lock-in, no black box.",
      headline: "Free 30-minute ad account audit",
      description: "Written report included",
      cta: "Book Now",
      factIds: ["F12", "F11"],
    },
    {
      angle: "pain-led",
      primaryText: "Boosted another post and got likes, not leads? Most D2C brands waste 60% of their spend this way. We build Meta campaigns around one number: sales or enquiries.",
      headline: "Likes don't pay the bills",
      description: "Build for results",
      cta: "Learn More",
      factIds: ["F7"],
    },
  ],
  googleAds: [
    {
      headlines: ["Stop Wasting Ad Spend", "Cut Wasted Ad Spend On Boosted Posts", "Free Ad Account Audit"],
      descriptions: ["Same budget, built for results. A coaching centre went from 1x to 3x enquiries.", "Free 30-minute audit with a written report. No lock-in contracts."],
      factIds: ["F6", "F12", "F11"],
    },
    {
      headlines: ["Meta & Google Ads Agency", "ROAS From 2.1 to 3.4", "Google Partner, Ahmedabad", "Live in 10 Working Days"],
      descriptions: ["Skincare brand: ROAS from 2.1 to 3.4 in 90 days with 3 audiences and weekly creatives.", "Weekly WhatsApp updates. You own the ad account. No black box."],
      factIds: ["F3", "F1", "F10", "F11"],
    },
    {
      headlines: ["Lower Your Cost Per Lead", "Leads From ₹420 to ₹260", "Book A Free Audit"],
      descriptions: ["Dental chain cut cost per lead from ₹420 to ₹260 with locality search & call tracking.", "We find where your spend leaks. Free 30-minute audit, written report."],
      factIds: ["F5", "F12"],
    },
  ],
  image: {
    channel: "Instagram",
    aspectRatio: "4:5",
    concept: "A founder's phone shows a glowing 'boost' style button fading out while a clean upward line of results rises behind it. It turns the pack's message — reach vs results — into one image that works in an Instagram feed.",
    prompt: "Editorial product photo of a smartphone lying on a matte black desk in a dim modern Ahmedabad studio, the screen glowing warm amber, a soft upward-trending abstract light trail rising from the phone like a growth chart made of light, shallow depth of field, cinematic side lighting, premium minimal style, warm gold and charcoal palette, vertical 4:5 composition. No text, no letters, no logos in the image.",
    altText: "A phone on a dark desk with a warm rising light trail, suggesting growth from smarter ad spend.",
  },
};

export const MOCK_REVISED: Pack = structuredClone(MOCK_DRAFT);
MOCK_REVISED.linkedin.post = MOCK_DRAFT.linkedin.post.replace(
  "Most D2C brands lose up to 40% of their ad budget on boosted posts.",
  "Boosted posts are the most expensive way to get likes.",
);
MOCK_REVISED.metaAds[2].primaryText =
  "Boosted another post and got likes, not leads? Boosting is built for reach, not sales. We build Meta campaigns around one number you care about: sales or enquiries.";
MOCK_REVISED.googleAds[0].headlines[1] = "Boosted Posts Not Selling?";

export function mockImage(ratio: string) {
  const [w, h] = ratio === "16:9" ? [1280, 720] : ratio === "1:1" ? [1024, 1024] : [1024, 1280];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<radialGradient id="g" cx="50%" cy="62%" r="60%"><stop offset="0" stop-color="#3a2a12"/><stop offset="1" stop-color="#0b0b0a"/></radialGradient>
<linearGradient id="t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e8c77a" stop-opacity="0"/><stop offset=".55" stop-color="#e8c77a" stop-opacity=".9"/><stop offset="1" stop-color="#fff2cf"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g transform="translate(${w / 2 - 150},${h * 0.52}) rotate(-8)">
<rect width="300" height="540" rx="36" fill="#121212" stroke="#2c2c2a" stroke-width="4"/>
<rect x="18" y="22" width="264" height="496" rx="24" fill="#1b160d"/>
<circle cx="150" cy="300" r="70" fill="#e8c77a" opacity=".18" filter="url(#b)"/>
<circle cx="150" cy="300" r="34" fill="none" stroke="#e8c77a" stroke-opacity=".35" stroke-width="3"/>
</g>
<path d="M ${w * 0.12} ${h * 0.82} C ${w * 0.35} ${h * 0.78}, ${w * 0.45} ${h * 0.55}, ${w * 0.6} ${h * 0.45} S ${w * 0.82} ${h * 0.2}, ${w * 0.9} ${h * 0.1}" stroke="url(#t)" stroke-width="10" fill="none" stroke-linecap="round"/>
<path d="M ${w * 0.12} ${h * 0.82} C ${w * 0.35} ${h * 0.78}, ${w * 0.45} ${h * 0.55}, ${w * 0.6} ${h * 0.45} S ${w * 0.82} ${h * 0.2}, ${w * 0.9} ${h * 0.1}" stroke="#e8c77a" stroke-width="40" fill="none" opacity=".25" filter="url(#b)"/>
<circle cx="${w * 0.9}" cy="${h * 0.1}" r="12" fill="#fff2cf"/>
</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}
