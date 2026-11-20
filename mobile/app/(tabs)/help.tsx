import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Card, Empty, Screen, SectionTitle } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';
import { colors, fonts, radius, space } from '../../src/theme';

type Icon = keyof typeof Ionicons.glyphMap;

const TOPICS: { icon: Icon; title: string; hint: string; go: string }[] = [
  { icon: 'rocket-outline', title: 'Getting started', hint: 'Your first project, step by step', go: '/learn/first-clips-in-five-minutes' },
  { icon: 'color-wand-outline', title: 'Auto edit', hint: 'Captions, jump cuts, zoom, sound', go: '/learn/auto-edit-explained' },
  { icon: 'sparkles-outline', title: 'AI clips', hint: 'OpusClip modes, prompts and credits', go: '/learn/choosing-a-clipping-mode' },
  { icon: 'phone-portrait-outline', title: 'Formats & framing', hint: '9:16, 16:9, 1:1, 4:5 and how they fill', go: '/learn/aspect-ratios-explained' },
  { icon: 'briefcase-outline', title: 'Brand kits', hint: 'Your logo on every clip', go: '/learn/brand-every-clip' },
  { icon: 'calendar-outline', title: 'Calendar', hint: 'Plan a week of posts', go: '/learn/plan-a-week-of-posts' },
  { icon: 'shield-checkmark-outline', title: 'Rights & fair use', hint: 'What you can clip', go: '/learn/clip-responsibly' },
];

const FAQ: { q: string; a: string; tag: string }[] = [
  { tag: 'Basics', q: 'Which sites can I clip from?', a: 'YouTube, TikTok, X/Twitter, Instagram, Facebook, Reddit, Twitch, Vimeo, direct .mp4 links and about 1,800 other sites. Private videos, members-only videos and live streams that have not ended cannot be downloaded. You can always upload the file instead.' },
  { tag: 'Basics', q: 'How long can the source video be?', a: 'Up to the server limit shown on the Create page (180 minutes by default). Uploads are limited by size (2 GB by default). The admin sets both.' },
  { tag: 'Basics', q: 'How long are my clips kept?', a: 'Finished projects are deleted after the number of days the admin sets (7 by default) to save disk space. Download what you want to keep, or use Download all (.zip).' },
  { tag: 'AI clips', q: 'Why is "AI clips" disabled?', a: 'AI clips run on OpusClip and need an OpusClip API key on the server (OPUSCLIP_API_KEY). Settings → AI engine shows whether it is connected. The other three modes work without it.' },
  { tag: 'AI clips', q: 'How many credits does an AI project use?', a: 'OpusClip charges one credit per minute of source video, with a minimum of 10 credits per project. Trim the video ("Only part of the video") to clip a section and spend less. Retrying a failed project re-uses the same OpusClip project.' },
  { tag: 'AI clips', q: 'Can I use AI clips with an uploaded file?', a: 'Not yet: AI clips work from links. For uploads use Best moments, Split evenly or Exact ranges.' },
  { tag: 'AI clips', q: 'How do I change the caption style of AI clips?', a: 'Caption style, fonts, emojis and layout come from your OpusClip brand template. Pick one under Brand templates, or edit templates in OpusClip.' },
  { tag: 'Clips', q: 'What does the score on a clip mean?', a: 'AI clips show OpusClip’s virality score (0–100). Best-moments clips show an energy score: how lively that stretch is compared with the rest of the video. Higher is a better bet to post first.' },
  { tag: 'Clips', q: 'I made phone clips. Can I get the desktop version?', a: 'Yes. On the project page press Desktop version (or Phone version). It cuts the same moments in the new shape.' },
  { tag: 'Clips', q: 'Why did my logo not appear?', a: 'Logos from brand kits are added to Best moments, Split evenly and Exact ranges clips, at render time. Check the kit has a logo and was selected on the Create page before you started. AI clips use the OpusClip template instead.' },
  { tag: 'Clips', q: 'Why do my clips have no captions?', a: 'Animated captions need speech-to-text on the server (faster-whisper, set up by WHISPER_CMD; the Docker image includes it). Settings → Server shows "whisper" when it is ready. Videos without speech get no captions; the other auto-edit steps still apply.' },
  { tag: 'Clips', q: 'Auto edit cut too much / too little', a: 'Remove silences only cuts pauses longer than about 0.6 s and never shortens a clip below half its length. For music, sports or gameplay, use the Off preset or switch Remove silences off.' },
  { tag: 'Errors', q: '“Video unavailable” or “sign in to confirm your age”', a: 'The site would not hand the video over: it may be private, age-restricted, region-locked or removed. Try another link, or download it yourself and upload the file.' },
  { tag: 'Errors', q: 'The project failed. What now?', a: 'Open the project: the red message says why. Press Try again for temporary problems (network, site hiccup). For uploads, the file is kept until the project is deleted, so a retry does not need a new upload.' },
  { tag: 'Errors', q: 'Upload stops at 100 MB', a: 'The site may run behind Cloudflare, which refuses uploads over 100 MB on its standard plans. Paste a link instead, or ask the admin for the direct upload address.' },
  { tag: 'Account', q: 'I forgot my password', a: 'Ask your workspace admin: Admin → Team → Reset password. Resetting signs you out everywhere.' },
  { tag: 'Account', q: 'Does the calendar post for me?', a: 'No, it plans and reminds. On the day, download the clip, copy the caption, post it in the app, then press Mark posted.' },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} style={styles.faq} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="title" style={{ flex: 1 }}>
          {q}
        </Text>
        <Ionicons name={open ? 'remove' : 'add'} size={18} color={colors.textMuted} />
      </View>
      {open ? (
        <Text variant="body" color={colors.textMuted} style={{ lineHeight: 23 }}>
          {a}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Help center: getting started, FAQ and troubleshooting for this workspace. */
export default function Help() {
  const [q, setQ] = useState('');
  const admin = useAuth((s) => s.user?.role === 'ADMIN');
  const faq = useMemo(() => {
    const t = q.trim().toLowerCase();
    return FAQ.filter((f) => !t || `${f.q} ${f.a}`.toLowerCase().includes(t));
  }, [q]);
  const tags = [...new Set(faq.map((f) => f.tag))];

  return (
    <Screen eyebrow="Resources" title="Help center" subtitle="Answers about clipping, AI clips, formats, brand kits and your account." wide>
      <View style={{ maxWidth: 640 }}>
        <Input icon="search" value={q} onChangeText={setQ} placeholder="Search help: credits, upload, logo, failed…" />
      </View>
      {!q ? (
        <View style={styles.topics}>
          {TOPICS.map((t) => (
            <Pressable key={t.title} onPress={() => router.push(t.go as never)} style={(s) => [styles.topic, (s as { hovered?: boolean }).hovered && styles.hover]}>
              <View style={styles.icon}>
                <Ionicons name={t.icon} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">{t.title}</Text>
                <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
                  {t.hint}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {faq.length ? (
        tags.map((tag) => (
          <View key={tag} style={{ gap: space.sm }}>
            <SectionTitle>{tag}</SectionTitle>
            {faq
              .filter((f) => f.tag === tag)
              .map((f) => (
                <Faq key={f.q} q={f.q} a={f.a} />
              ))}
          </View>
        ))
      ) : (
        <Empty icon="help-buoy-outline" title="No answer found" hint="Try different words, or ask your workspace admin." />
      )}
      <Card glow style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Ionicons name="chatbubbles-outline" size={22} color={colors.brand} />
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text variant="title">Still stuck?</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            {admin ? 'You are the admin: Settings → Server shows which video tools are installed, and Admin lists failed projects.' : 'Ask your workspace admin. Include the project name and the red error message.'}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  topic: { flexGrow: 1, flexBasis: 300, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  faq: { gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
