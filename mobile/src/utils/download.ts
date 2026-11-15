import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { mediaUrl } from '../api/client';

/**
 * Save a clip (or the zip of all clips). On the web the browser downloads it (the server sends it as
 * an attachment with a proper file name); on a phone it is downloaded and handed to the share sheet,
 * where it can be saved to the gallery or posted straight to TikTok, Instagram, WhatsApp…
 */
export async function saveFile(path: string, fileName: string) {
  const url = mediaUrl(path);
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const target = `${FileSystem.cacheDirectory}${fileName}`;
  const { uri } = await FileSystem.downloadAsync(url, target);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: fileName.endsWith('.zip') ? 'application/zip' : 'video/mp4', dialogTitle: fileName });
}

/** Share a clip's link (web: system share or copy). */
export async function shareLink(path: string, title: string) {
  const url = mediaUrl(path);
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (nav.share) return nav.share({ title, url }).catch(() => undefined);
    await navigator.clipboard?.writeText(url);
    return 'copied';
  }
  return saveFile(path, `${title}.mp4`);
}
