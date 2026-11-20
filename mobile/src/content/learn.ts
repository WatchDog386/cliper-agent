import type Ionicons from '@expo/vector-icons/Ionicons';

export type Block = { h: string } | { p: string } | { list: string[] } | { tip: string } | { steps: string[] };

export interface Article {
  slug: string;
  title: string;
  summary: string;
  category: 'Get started' | 'Go viral' | 'Formats' | 'Workflow';
  minutes: number;
  icon: keyof typeof Ionicons.glyphMap;
  body: Block[];
}

/** Learning center: short, practical guides for making clips that travel. */
export const ARTICLES: Article[] = [
  {
    slug: 'first-clips-in-five-minutes',
    title: 'Your first clips in five minutes',
    summary: 'Paste a link, pick a mode, download. The whole loop, start to finish.',
    category: 'Get started',
    minutes: 3,
    icon: 'rocket-outline',
    body: [
      { p: 'Cliper Agent turns one long video into many short ones. You bring the link (or a file), the agent downloads it, finds the parts worth keeping and renders clips sized for where they will be watched.' },
      {
        steps: [
          'Copy the link of a video: YouTube, TikTok, X, Instagram, Twitch, Vimeo and about 1,800 other sites work.',
          'On Home, paste it into the big box and press Get clips. The Create page opens with the video already read.',
          'Pick a mode. AI clips if you want hooks, captions and a virality score; Best moments for fast, free picks by energy; Split evenly or Exact ranges for full control.',
          'Pick the format: 9:16 for TikTok, Reels and Shorts; 16:9 for YouTube and the web.',
          'Press Clip it. The project page shows each step; you can leave and come back.',
          'Download clips one by one, or everything as a .zip. On a phone, the share sheet saves to your gallery or posts directly.',
        ],
      },
      { tip: 'The Create page remembers your last settings, so the next project is two taps.' },
    ],
  },
  {
    slug: 'choosing-a-clipping-mode',
    title: 'Which clipping mode should I use?',
    summary: 'AI clips, Best moments, Split evenly or Exact ranges: when each one wins.',
    category: 'Get started',
    minutes: 4,
    icon: 'git-branch-outline',
    body: [
      { h: 'AI clips (OpusClip)' },
      { p: 'Best for podcasts, interviews, talks and anything with a story. The AI reads what is said, finds self-contained moments with a strong opening, adds animated captions and writes a title, caption and hashtags. Each clip gets a virality score, and clips come back ranked. It uses OpusClip credits: one per source minute, ten minimum.' },
      { list: ['ClipAnything: any video, including sports, gaming and vlogs. Tell it what to look for, e.g. "every goal" or "the funniest reactions".', 'ClipBasic: talking videos. Optional topic keywords steer it.'] },
      { h: 'Best moments' },
      { p: 'Free and fast. The agent measures loudness every second and keeps the most energetic stretches: cheering, laughter, a punchline, a drop. Great for sports, concerts, streams and reactions.' },
      { h: 'Split evenly' },
      { p: 'Back-to-back clips of exactly the length you choose. Use it for series ("part 1, part 2…"), lectures and recaps.' },
      { h: 'Exact ranges' },
      { p: 'You already know the timestamps. List them (1:05 → 1:35) and get exactly those clips.' },
      { tip: 'Not sure? Run Best moments first (free), then AI clips on the videos that deserve it.' },
    ],
  },
  {
    slug: 'auto-edit-explained',
    title: 'Auto edit: what each switch does',
    summary: 'Captions, smart cuts, jump cuts, zoom, sound and the progress bar, and when to use them.',
    category: 'Get started',
    minutes: 4,
    icon: 'color-wand-outline',
    body: [
      { p: 'Turning a long video into shorts is two jobs: finding the moments, then editing each one so it holds attention. Auto edit does the second job for every clip, on your server, at no extra cost.' },
      {
        list: [
          'Animated captions: most people watch muted. Captions appear word by word and the word being spoken lights up in your brand colour. Needs speech-to-text on the server.',
          'Hook title: the clip’s opening sentence, big, at the top for the first seconds, so the scroll stops.',
          'Smart cuts: the clip’s start and end move to sentence boundaries, so no clip begins mid-word or ends before the punchline.',
          'Remove silences: pauses longer than about 0.6 s are cut. The result feels like a tight, hand-edited jump-cut video.',
          'Punch-in zoom: every few seconds the frame jumps 12% closer, then back. A classic editor trick for talking heads.',
          'Enhance audio: removes low rumble and hiss and levels the sound to −14 LUFS, the loudness TikTok, Reels and YouTube play at.',
          'Progress bar: a thin bar along the bottom that fills as the clip plays. It tells viewers the clip is short, so they stay.',
        ],
      },
      { h: 'Presets' },
      { list: ['Viral: everything on. Best for podcasts, interviews, commentary.', 'Clean: captions, smart cuts, jump cuts and audio; no zoom or bar. Best for brands and tutorials.', 'Off: the clip exactly as cut. Best for music, sports and gameplay where silence and pacing matter.'] },
      { tip: 'Captions and the progress bar take the primary colour of the brand kit you choose on the Create page.' },
    ],
  },
  {
    slug: 'hooks-that-stop-the-scroll',
    title: 'Hooks that stop the scroll',
    summary: 'You have about two seconds. Eight openings that keep people watching.',
    category: 'Go viral',
    minutes: 5,
    icon: 'flash-outline',
    body: [
      { p: 'Short-form feeds decide in the first one to two seconds. A clip that starts mid-sentence or on a slow intro gets swiped, however good the rest is. Start where the tension starts.' },
      {
        list: [
          'The bold claim: "This one habit doubled my income."',
          'The open question: "Why do 90% of startups die in year two?"',
          'The reaction first: show the laugh, the gasp, the goal, then the setup.',
          'The number: "3 mistakes every new runner makes."',
          'The contradiction: "Everything you know about protein is wrong."',
          'The direct address: "If you edit videos, stop doing this."',
          'The cliffhanger: cut right before the reveal and pay it off at the end.',
          'The pattern break: an unexpected sound, zoom or visual in frame one.',
        ],
      },
      { tip: 'In AI mode, switch on "AI hook headline" to put a punchy title over the first seconds of every clip.' },
      { h: 'Trim the run-up' },
      { p: 'If a clip starts with "so, um, anyway", use Exact ranges and start two seconds later. Losing a breath is cheap; losing the viewer is not.' },
    ],
  },
  {
    slug: 'reading-the-virality-score',
    title: 'Reading the virality score',
    summary: 'What the number means, and how to use it to pick what to post first.',
    category: 'Go viral',
    minutes: 3,
    icon: 'speedometer-outline',
    body: [
      { p: 'AI clips come with a score from 0 to 100: the AI’s estimate of how likely the clip is to perform, based on the hook, how self-contained it is, emotion, pacing and trend fit. Best-moments clips get an energy score instead: how loud and lively the stretch is compared to the rest of the video.' },
      { list: ['85 and up: lead with these. Post first, at your best time slot.', '70 to 84: solid. Pair with a sharp caption and a good thumbnail frame.', 'Under 70: use them to fill the calendar, or as B-roll for compilations.'] },
      { tip: 'A score is a starting point, not a verdict. Post a few, see what your audience does, and trust that over any number.' },
    ],
  },
  {
    slug: 'aspect-ratios-explained',
    title: '9:16, 16:9, 1:1, 4:5: which format where',
    summary: 'The right shape for every platform, and how framing (fill, blur, letterbox) works.',
    category: 'Formats',
    minutes: 4,
    icon: 'phone-portrait-outline',
    body: [
      { list: ['9:16 (1080×1920): TikTok, Instagram Reels and Stories, YouTube Shorts, Snapchat.', '16:9 (1920×1080): YouTube, websites, presentations, X.', '1:1 (1080×1080): feeds on LinkedIn, Facebook and X.', '4:5 (1080×1350): the tallest shape the Instagram and Facebook feed shows without cropping.'] },
      { h: 'When the source is a different shape' },
      { list: ['Fill & crop: fills the screen and trims the sides. Best when the action is in one place; set the focus (left, centre, right).', 'Blurred fill: the whole picture, on a blurred, zoomed copy of itself. Nothing is lost; looks native on vertical feeds.', 'Letterbox: the whole picture with black bars. Clean, but smaller on screen.'] },
      { tip: 'Made a phone set and need it for YouTube too? On the project page press Desktop version: same moments, new shape, no re-download.' },
    ],
  },
  {
    slug: 'brand-every-clip',
    title: 'Brand every clip with a brand kit',
    summary: 'Upload your logo once; every clip carries it in the corner you choose.',
    category: 'Workflow',
    minutes: 3,
    icon: 'briefcase-outline',
    body: [
      {
        steps: [
          'Open Brand kits and press New brand kit.',
          'Upload your logo (PNG with a transparent background looks best, up to 1 MB).',
          'Choose the corner, size and opacity. The 9:16 preview shows exactly where it lands.',
          'Turn on Default brand kit so the Create page selects it for you.',
        ],
      },
      { p: 'The logo is burned into clips made with Best moments, Split evenly and Exact ranges. AI clips use the brand template from your OpusClip account instead (see Brand templates).' },
      { tip: 'Keep the logo small (12–18%) and away from where captions sit: top corners for talking heads, bottom corners for sports.' },
    ],
  },
  {
    slug: 'plan-a-week-of-posts',
    title: 'Plan a week of posts from one video',
    summary: 'One podcast episode, seven days of content, without burning out.',
    category: 'Workflow',
    minutes: 4,
    icon: 'calendar-outline',
    body: [
      { p: 'A 45-minute episode usually holds eight to fifteen strong moments. Spread them out: one great clip a day beats ten on Monday and silence after.' },
      {
        steps: [
          'Run AI clips with up to 10 clips.',
          'Open the best-scoring clip and press Schedule. Pick TikTok, tomorrow, 18:00.',
          'Schedule the next ones on the following days, alternating platforms (TikTok, Reels, Shorts).',
          'Each day, the calendar shows what goes out. Download the clip, copy the caption, post it, then press Mark posted.',
        ],
      },
      { tip: 'Post the same clip on several platforms on different days. Different feeds, different audiences.' },
    ],
  },
  {
    slug: 'clip-responsibly',
    title: 'Clip responsibly: rights and fair use',
    summary: 'What you can clip, what to ask permission for, and how to credit.',
    category: 'Workflow',
    minutes: 3,
    icon: 'shield-checkmark-outline',
    body: [
      { p: 'Only clip videos you own or have permission to reuse. Many creators welcome clippers and even run clip programs; others do not. When in doubt, ask.' },
      { list: ['Your own content, your company’s, or content licensed to you: go ahead.', 'Someone else’s: get permission, credit them in the caption and respect their terms.', 'Platforms remove reposted content and can strike accounts. Commentary, criticism and education are treated differently from straight reposts, but rules vary by country.'] },
      { tip: 'This is not legal advice. For anything commercial, check with the rights holder.' },
    ],
  },
];

export const CATEGORIES = ['All', 'Get started', 'Go viral', 'Formats', 'Workflow'] as const;
