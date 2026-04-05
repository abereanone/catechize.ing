const appVersion = '0.1.2';
const siteName = 'catechize.ing';
const defaultDescription = 'Questions & Answers from reformed catechisms';
const branding = {
  siteName,
  tagline: defaultDescription,
  description: defaultDescription,
  logoPath: '/images/site-logo.svg',
  logoAlt: `${siteName} logo`,
} as const;
const defaultSiteUrl = 'https://catechize.ing';

export const siteSettings = {
  version: appVersion,
  branding,
  issueReportURL: 'https://github.com/abereanone/catechize.ing/issues/new',
  longExplanationText: 'Additional Exposition',
  integrations: {
    googleAnalyticsId: 'G-P6JZ4RPS97',
  },
  openGraph: {
    title: branding.siteName,
    description: branding.description,
    url: defaultSiteUrl,
    image: '/images/og-card.png',
    imageAlt: `${branding.siteName} logo`,
    type: 'website',
    twitterCard: 'summary_large_image',
  },
  showQuestionId: true,
  showAuthor: false,
  hideAnswersByDefault: false,
  enablePagination: true,
  questionsPerPage: 30,
} as const;

export type SiteSettings = typeof siteSettings;
