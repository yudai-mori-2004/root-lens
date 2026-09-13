import {
  createAudioPlayer,
  preload,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';

export type SfxName =
  | 'enter_capture'
  | 'detect_palm'
  | 'detect_thumbs_up'
  | 'detect_cancel'
  | 'countdown_tick'
  | 'countdown_end'
  | 'rec_stop';

// 効果音の意図する仕様 (= 役割・音色・長さ)。 ファイル名にも長さと内容を埋め込んである。
// 音源を差し替える時はこの仕様 (短く・テンポ良く) に沿った音を同じファイル名で置くこと。
// ⚠ 鳴らすタイミングは音声シーケンサが「前の音/TTS の完了を待って」 から順に再生するので、
//   多少長くても重ならないが、 UX のテンポのため下記の短い長さを推奨。
//
//   enter_capture    入場時の柔らかいチャイム         ~0.4s   (session 開始時に 1 回)
//   detect_palm      キャリブ確定の肯定的な確定音      ~0.4s   (手のひら中央 OK)
//   detect_thumbs_up サムズアップ → 停止の確定音        ~0.4s
//   detect_cancel    停止シーケンス中のキャンセル音    ~0.2s   (下降ベンド、 目立たせない)
//   countdown_tick   3/2/1 の極短ブリップ               ~0.15s  (各カウントで 1 回)
//   countdown_end    カウント終了 = 録画開始の合図音    ~0.5s   (上昇音など「ゴー」)
//   rec_stop         録画停止音                          ~0.4s
//
// require() の path は static 文字列のみ解決可。 ファイル名に長さ・内容を含める。
const SOURCES: Record<SfxName, AudioSource> = {
  enter_capture:    require('../../assets/sounds/enter_capture_chime_0.4s.mp3'),
  detect_palm:      require('../../assets/sounds/detect_palm_confirm_0.4s.mp3'),
  detect_thumbs_up: require('../../assets/sounds/detect_thumbs_up_confirm_0.4s.mp3'),
  detect_cancel:    require('../../assets/sounds/detect_cancel_blip_0.2s.mp3'),
  countdown_tick:   require('../../assets/sounds/countdown_tick_blip_0.15s.mp3'),
  countdown_end:    require('../../assets/sounds/countdown_end_go_0.5s.mp3'),
  rec_stop:         require('../../assets/sounds/rec_stop_soft_0.4s.mp3'),
};

const sounds: Partial<Record<SfxName, AudioPlayer>> = {};
let preloaded = false;
let preloading: Promise<void> | null = null;

async function ensureAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
  } catch (error) {
    console.warn('[captureSounds] failed to configure audio mode:', error);
  }
}

export async function preloadCaptureSounds(): Promise<void> {
  if (preloaded) return;
  if (preloading) return preloading;
  preloading = (async () => {
    await ensureAudioMode();
    const entries = Object.entries(SOURCES) as [SfxName, AudioSource][];
    await Promise.all(
      entries.map(async ([name, src]) => {
        try {
          await preload(src);
          sounds[name] = createAudioPlayer(src, { updateInterval: 50 });
        } catch (e) {
          console.warn(`[captureSounds] failed to preload ${name}:`, e);
        }
      }),
    );
    preloaded = true;
    preloading = null;
  })();
  return preloading;
}

export function playSfx(name: SfxName): void {
  const player = sounds[name];
  if (!player) return;
  void player.seekTo(0).then(() => player.play()).catch((error) => {
    console.warn(`[captureSounds] failed to play ${name}:`, error);
  });
}

export async function playSfxAwait(name: SfxName): Promise<void> {
  // preload 未完なら待ってから再生する (= 起動直後の enter_capture 等が「未ロードだから skip」 で
  // 無音になり、 後続の TTS だけ流れて順序が崩れるのを防ぐ)。
  if (!sounds[name]) await preloadCaptureSounds();
  const player = sounds[name];
  if (!player) return;
  await new Promise<void>((resolve) => {
    let done = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
      resolve();
    };
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.isLoaded) return;
      if (status.playing) { started = true; return; }
      // 自然終了 (didJustFinish) だけでなく、 stopAllSfx で止められた場合 (= 再生開始後に
      // isPlaying が false へ戻る) も即 resolve する。 ⚠ これが無いと停止された音の await が
      // 下の保険タイマーまで宙吊りになり、 音声キュー全体が数秒止まる。
      if (status.didJustFinish || started) finish();
    });
    player.seekTo(0).then(() => player.play()).catch((error) => {
      console.warn(`[captureSounds] failed to play ${name}:`, error);
      finish();
    });
    // status 更新が一切来ないケースの保険 (= 想定最大長 0.6s + 余裕)。
    timer = setTimeout(finish, 3000);
  });
}

export function stopAllSfx(): void {
  for (const name of Object.keys(sounds) as SfxName[]) {
    sounds[name]?.pause();
  }
}

export async function unloadCaptureSounds(): Promise<void> {
  for (const name of Object.keys(sounds) as SfxName[]) {
    const player = sounds[name];
    if (player) {
      player.remove();
      delete sounds[name];
    }
  }
  preloaded = false;
}
