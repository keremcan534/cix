// Android / iOS: YouTube's official IFrame Player API inside a WebView (react-native-webview, included in Expo
// Go). The page is created once; the room's state reaches it as small commands. The page is loaded from the
// app's own origin so YouTube gets a referrer; any link that leaves YouTube's player opens outside the app.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { DRIFT_CHECK_MS, OWN_COMMAND_MS, YT_STATE, type YouTubePlayerProps } from '@/components/room/youtube-player-props';
import { SYNC_TOLERANCE_S, expectedPosition } from '@/lib/room-modes';
import { EMBED_ORIGIN, isVideoId, isYouTubeHost } from '@/lib/youtube';

// The page only ever receives values built here (a validated id, numbers, booleans) through JSON.stringify.
const page = (videoId: string) => `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{width:100%;height:100%}</style></head>
<body><div id="p"></div><script>
var player=null,ready=false,loaded=${JSON.stringify(videoId)},lastCmd=0;
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){send({t:'loadError'});};document.head.appendChild(s);
function onYouTubeIframeAPIReady(){player=new YT.Player('p',{width:'100%',height:'100%',videoId:loaded,
playerVars:{playsinline:1,rel:0,origin:${JSON.stringify(EMBED_ORIGIN)}},
events:{onReady:function(){ready=true;send({t:'ready',d:player.getDuration()});},
onStateChange:function(e){send({t:'state',s:e.data,d:player.getDuration(),own:Date.now()-lastCmd<${OWN_COMMAND_MS}});},
onError:function(e){send({t:'error',c:e.data});}}});}
window.cmd=function(c){if(!player||!ready)return;try{
if(c.muted)player.mute();else player.unMute();
if(c.id!==loaded){loaded=c.id;lastCmd=Date.now();if(c.play)player.loadVideoById({videoId:c.id,startSeconds:c.at});else player.cueVideoById({videoId:c.id,startSeconds:c.at});return;}
if(c.hold)return;
var st=player.getPlayerState(),cur=player.getCurrentTime()||0;
if(Math.abs(cur-c.at)>c.tol){lastCmd=Date.now();player.seekTo(c.at,true);}
if(c.play&&st!==1&&st!==3){lastCmd=Date.now();player.playVideo();}else if(!c.play&&st===1){lastCmd=Date.now();player.pauseVideo();}
}catch(e){}};
</script></body></html>`;

export function YouTubePlayer(props: YouTubePlayerProps) {
  // `object`: the package's class typing defaults its extra-props parameter to `undefined` (props would be never).
  const web = useRef<WebView<object>>(null);
  const ready = useRef(false);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastState = useRef<number>(YT_STATE.unstarted);
  // Built once from the first video: later videos are loaded by command, so the page is never rebuilt.
  const [html] = useState(() => page(isVideoId(props.playback.videoId) ? props.playback.videoId : ''));
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const apply = useCallback(() => {
    const { playback, hold, muted, onBlocked } = latest.current;
    if (!ready.current || !isVideoId(playback.videoId) || playback.playbackStatus === 'error') return;
    const play = playback.playbackStatus === 'playing' && !hold;
    const c = { id: playback.videoId, at: expectedPosition(playback), play, hold, muted, tol: SYNC_TOLERANCE_S };
    web.current?.injectJavaScript(`window.cmd&&window.cmd(${JSON.stringify(c)});true;`);
    clearTimeout(blockTimer.current);
    if (play)
      blockTimer.current = setTimeout(() => {
        const s = lastState.current;
        onBlocked(s !== YT_STATE.playing && s !== YT_STATE.buffering && latest.current.playback.playbackStatus === 'playing' && !latest.current.hold);
      }, 3000);
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { t?: string; s?: number; d?: number; c?: number; own?: boolean };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const { playback: room, hold, onReport, onUserState, onBlocked, onLoadError } = latest.current;
    if (typeof m.d === 'number' && m.d > 0) onReport({ duration: m.d });
    if (m.t === 'ready') {
      ready.current = true;
      apply();
    } else if (m.t === 'state' && typeof m.s === 'number') {
      lastState.current = m.s;
      if (m.s === YT_STATE.playing) onBlocked(false);
      if (m.s === YT_STATE.ended) onReport({ ended: true });
      if (m.own) return;
      if (m.s === YT_STATE.paused && room.playbackStatus === 'playing' && !hold) onUserState(false);
      if (m.s === YT_STATE.playing && (hold || room.playbackStatus !== 'playing')) onUserState(true);
    } else if (m.t === 'error' && typeof m.c === 'number') onReport({ errorCode: m.c });
    else if (m.t === 'loadError') onLoadError('YouTube oynatıcısı yüklenemedi. Bağlantını kontrol edip yeniden dene.');
  };

  const p = props.playback;
  useEffect(() => apply(), [apply, p.videoId, p.playbackStatus, p.position, p.updatedAt, props.hold, props.muted]);
  useEffect(() => {
    const t = setInterval(apply, DRIFT_CHECK_MS);
    return () => {
      clearInterval(t);
      clearTimeout(blockTimer.current);
    };
  }, [apply]);

  return (
    <WebView<object>
      ref={web}
      source={{ html, baseUrl: EMBED_ORIGIN }}
      style={st.web}
      originWhitelist={['https://*', 'about:blank']}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === 'about:blank' || req.url.startsWith(EMBED_ORIGIN)) return true;
        // Inside the player frame YouTube may load its own pages; leaving the player (logo, title) opens outside.
        if (req.isTopFrame === false && isYouTubeHost(req.url)) return true;
        if (isYouTubeHost(req.url)) Linking.openURL(req.url).catch(() => {});
        return false;
      }}
    />
  );
}

const st = StyleSheet.create({ web: { flex: 1, backgroundColor: '#000' } });
