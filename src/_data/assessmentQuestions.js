/**
 * Assessment funnel: ~20 questions that surface risk areas.
 * Each question maps to one or more risk slugs/labels when the answer indicates possible risk.
 */
module.exports = [
  {
    id: "q1",
    text: "Does your child use or have access to apps where they can chat or video call with people they don't know in real life?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["stranger-chat", "video-chat", "monkey-app", "wizz", "yubo"],
  },
  {
    id: "q2",
    text: "Do they use TikTok, and do they watch or go live on TikTok Live?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["tiktok-live", "live-streaming", "grooming"],
  },
  {
    id: "q3",
    text: "Are they on Discord or in Discord servers with people they haven't met in person?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["discord", "dm", "grooming", "sextortion"],
  },
  {
    id: "q4",
    text: "Do they use Telegram or other apps with disappearing or encrypted messages?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["telegram", "encrypted", "dm"],
  },
  {
    id: "q5",
    text: "Have they ever been asked to send photos, videos, or do something on camera by someone they met online?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "Not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "unsure"],
    risks: ["sextortion", "grooming", "live-streaming"],
  },
  {
    id: "q6",
    text: "Do they play games where they can voice chat or message other players they don't know?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["gaming-voice-chat", "roblox", "grooming"],
  },
  {
    id: "q7",
    text: "Do they use Roblox, and do they add friends or chat with other players in-game?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["roblox", "impersonation", "gaming"],
  },
  {
    id: "q8",
    text: "Have they talked about investing, crypto, or \"making money\" from something they saw on TikTok, Discord, or Instagram?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["crypto-scams", "pumpfun", "meme-coins", "scams"],
  },
  {
    id: "q9",
    text: "Do they use anonymous Q&A or messaging apps (e.g. ones linked from Instagram or Snapchat)?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["ngl", "bullying", "anonymous"],
  },
  {
    id: "q10",
    text: "Do they get a lot of direct messages or friend requests from people they don't know?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["social-media-dm", "dm", "grooming", "impersonation"],
  },
  {
    id: "q11",
    text: "Have they mentioned being pressured or blackmailed by someone online (e.g. threats to share a photo or secret)?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "Not sure / worried" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "unsure"],
    risks: ["sextortion", "discord", "telegram", "grooming"],
  },
  {
    id: "q12",
    text: "Do they use apps or sites that you've never heard of or that aren't on the main app stores?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["unmoderated-apps", "weak-age-verification", "moderation"],
  },
  {
    id: "q13",
    text: "Have they been upset or secretive about something that happened online?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["bullying", "sextortion", "social-media-dm"],
  },
  {
    id: "q14",
    text: "Do they watch or follow influencers who promote crypto, trading, or \"get rich\" schemes?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["crypto-scams", "scams"],
  },
  {
    id: "q15",
    text: "Do they share their screen name, school, or location with online friends they haven't met?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["grooming", "impersonation", "social-media-dm"],
  },
  {
    id: "q16",
    text: "Have they ever been sent or seen deepfakes, fake profiles, or \"AI\" content that was used to bully or trick someone?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "Not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "unsure"],
    risks: ["ai-generated-content", "impersonation"],
  },
  {
    id: "q17",
    text: "Do they use apps where messages disappear after being read or that are \"private\" or encrypted?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["encrypted-ephemeral", "dm"],
  },
  {
    id: "q18",
    text: "When they search or scroll, have they ever stumbled on violent, sexual, or very upsetting content by accident?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Maybe / not sure" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["unfiltered-search", "content", "moderation"],
  },
  {
    id: "q19",
    text: "Do they have their own payment app, card, or access to crypto or trading apps?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "sometimes", label: "Shared / limited" },
      { value: "no", label: "No" },
    ],
    riskWhen: ["yes", "sometimes"],
    risks: ["crypto-scams", "scams"],
  },
  {
    id: "q20",
    text: "Would they know how to report something scary or wrong to you or to the app, and would they tell you?",
    options: [
      { value: "no", label: "Probably not" },
      { value: "unsure", label: "Not sure" },
      { value: "yes", label: "Yes" },
    ],
    riskWhen: ["no", "unsure"],
    risks: ["talk-regularly", "know-where-to-report", "use-safety-tools"],
  },
];
