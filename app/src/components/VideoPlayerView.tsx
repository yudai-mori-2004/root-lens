import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function VideoPlayerView({
  uri,
  style,
  playing,
  loop = false,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  playing: boolean;
  loop?: boolean;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
  });

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);

  return <VideoView player={player} style={style} contentFit="contain" nativeControls />;
}
