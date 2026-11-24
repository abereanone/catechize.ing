const appVersion = "0.1.3";
const siteName = "catechize.ing";
const defaultDescription = "Questions & Answers from reformed catechisms";
const branding = {
  siteName,
  tagline: defaultDescription,
  description: defaultDescription,
  logoPath: "/images/site-logo.svg",
  logoAlt: `${siteName} logo`,
} as const;
const defaultSiteUrl = "https://catechize.ing";

export const siteSettings = {
  version: appVersion,
  branding,
  issueReportURL: "https://github.com/abereanone/catechize.ing/issues/new",
  longExplanationText: "Additional Exposition",
  integrations: {
    // Google Analytics removed 2026-11-24: stats come from Cloudflare (C:/code/site-stats).
    googleAnalyticsId: "",
  },
  openGraph: {
    title: branding.siteName,
    description: branding.description,
    url: defaultSiteUrl,
    image: "/images/og-card.png",
    imageAlt: `${branding.siteName} logo`,
    type: "website",
    twitterCard: "summary_large_image",
  },
  showQuestionId: true,
  showAuthor: false,
  // Baptist Catechism recordings by James Scott Orrick (distribution permission
  // granted 2026-11-22). Gates the players, /listen and the /audio/* route.
  enableAudio: true as boolean,
  audioCredit: {
    title: "The Baptist Catechism Set to Music",
    author: "James Scott Orrick",
  },
  hideAnswersByDefault: false,
  enablePagination: true,
  questionsPerPage: 30,
} as const;

export type SiteSettings = typeof siteSettings;
