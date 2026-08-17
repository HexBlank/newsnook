import assert from 'node:assert/strict'

import {
  bestMediaUrlInPayload,
  buildMediaDescriptor,
  collectMediaCandidates,
  mediaFingerprint,
  observeMediaInHtml,
  observeMediaInPayload,
  parseDashManifest,
  parseHlsManifest,
  mediaFormatFor,
} from '../src/features/mediaSniffer/core'
import type { MediaObservation } from '../src/features/mediaSniffer/types'
import { shouldBridgeNativePlayback } from '../src/features/mediaSniffer/playback'
import {
  embeddedPageUrlsInHtml,
  runtimeProbePageUrl,
} from '../src/features/mediaSniffer/service'

const pageUrl = 'https://news.example/articles/42'

{
  assert.deepEqual(
    embeddedPageUrlsInHtml(
      '<iframe src="/player/42"></iframe><iframe data-src="https://video.example/embed/7?x=1&amp;y=2"></iframe>',
      pageUrl,
    ),
    [
      'https://news.example/player/42',
      'https://video.example/embed/7?x=1&y=2',
    ],
    '正文播放器 iframe 应作为独立运行时探测目标，而不是只加载文章外层页面',
  )
}

{
  const original = 'https://www.youtube.com/embed/M7lc1UVf-VE?start=3'
  const probe = new URL(runtimeProbePageUrl(original))
  assert.equal(probe.searchParams.get('start'), '3')
  assert.equal(probe.searchParams.get('autoplay'), '1')
  assert.equal(probe.searchParams.get('mute'), '1')
  assert.equal(
    runtimeProbePageUrl('https://video.example/player/42?token=signed'),
    'https://video.example/player/42?token=signed',
    '未知站点不得擅自改写签名播放器 URL',
  )
}

{
  assert.equal(
    shouldBridgeNativePlayback({ format: 'progressive' }),
    false,
    '公开 MP4 应交给 WebView 原生网络栈持续处理 Range 请求',
  )
  assert.equal(
    shouldBridgeNativePlayback({ format: 'progressive', forceBridge: true }),
    true,
    '直连失败后可切换到带会话头的流式桥接',
  )
  assert.equal(
    shouldBridgeNativePlayback({ format: 'dash' }),
    true,
    'DASH 清单与分片需要共享原生播放会话',
  )
  assert.equal(
    shouldBridgeNativePlayback({ format: 'progressive', headers: { Referer: pageUrl } }),
    true,
    '显式请求头必须由原生桥接补齐',
  )
}

{
  const muxed = 'https://cdn.example/videoplayback?id=42&mime=video%2Fmp4'
  const ranged = `${muxed}&range=0-524287`
  assert.equal(mediaFormatFor(muxed), 'progressive', '查询参数 MIME 应识别无扩展名媒体')
  assert.equal(mediaFormatFor(ranged), 'segment', '带 URL byte range 的响应只是分片，不能冒充完整视频')
  assert.equal(
    buildMediaDescriptor([{ url: ranged, pageUrl, source: 'network' }]),
    null,
    '只有媒体分片时必须继续嗅探或降级，不能交给播放器后播放一秒即中断',
  )
  assert.equal(
    buildMediaDescriptor([{
      url: 'https://cdn.example/videoplayback?id=private-transport',
      pageUrl,
      source: 'fetch',
      mimeType: 'application/vnd.example-private-stream',
    }]),
    null,
    '私有传输协议不能伪装成 MP4；必须保留原播放器降级路径',
  )
}

{
  const muxedUrl = 'https://cdn.example/play?id=muxed&mime=video%2Fmp4'
  const adaptiveUrl = 'https://cdn.example/play?id=video-only&mime=video%2Fmp4'
  const observations = observeMediaInPayload({
    streamingData: {
      formats: [{
        url: muxedUrl,
        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        qualityLabel: '360p',
        audioQuality: 'AUDIO_QUALITY_LOW',
        width: 640,
        height: 360,
        bitrate: 720000,
      }],
      adaptiveFormats: [{
        url: adaptiveUrl,
        mimeType: 'video/mp4; codecs="avc1.640028"',
        qualityLabel: '1080p',
        width: 1920,
        height: 1080,
        bitrate: 4500000,
      }],
    },
  }, pageUrl)
  const descriptor = buildMediaDescriptor(observations)
  assert.equal(descriptor?.url, muxedUrl, '完整音视频资源应优先于更高清的无声自适应轨道')
  assert.equal(descriptor?.hasAudio, true)
}

{
  const signed = 'https://cdn.example/master.m3u8?token=secret&expires=1800000000&lang=zh'
  assert.equal(
    mediaFingerprint(signed),
    'https://cdn.example/master.m3u8?lang=zh',
    '指纹可忽略临时授权参数，但播放 URL 不应被修改',
  )
  const observations: MediaObservation[] = [
    { url: 'https://cdn.example/segment-001.ts', pageUrl, source: 'network' },
    { url: signed, pageUrl, source: 'network' },
    { url: 'https://cdn.example/fallback.mp4', pageUrl, source: 'dom' },
  ]
  const candidates = collectMediaCandidates(observations)
  assert.equal(candidates[0].originalUrl, signed, '完整清单必须优先于单文件和分片')
  assert.ok(!candidates.some((item) => item.format === 'segment'), '发现完整媒体后不展示分片')
}

{
  const hls = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="zh",URI="audio/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",URI="subs/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aac",SUBTITLES="subs"
video/1080.m3u8`
  const parsed = parseHlsManifest(hls, 'https://cdn.example/master.m3u8')
  assert.deepEqual(parsed.videoTracks[0], {
    kind: 'video',
    url: 'https://cdn.example/video/1080.m3u8',
    bandwidth: 3200000,
    width: 1920,
    height: 1080,
    codecs: 'avc1.640028,mp4a.40.2',
    groupId: 'aac',
  })
  assert.equal(parsed.audioTracks[0].url, 'https://cdn.example/audio/index.m3u8')
  assert.equal(parsed.subtitles[0].language, 'en')
  assert.equal(parsed.drm, false)
}

{
  const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
      <Representation bandwidth="5000000" width="1920" height="1080" codecs="avc1.640028"><BaseURL>video/1080.m4s</BaseURL></Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" lang="zh"><Representation bandwidth="128000" codecs="mp4a.40.2" /></AdaptationSet>
  </Period>
</MPD>`
  const parsed = parseDashManifest(dash, 'https://cdn.example/manifest.mpd')
  assert.equal(parsed.videoTracks[0].height, 1080)
  assert.equal(parsed.videoTracks[0].url, 'https://cdn.example/video/1080.m4s')
  assert.equal(parsed.audioTracks[0].language, 'zh')
  assert.equal(parsed.drm, true, 'ContentProtection 必须进入 DRM 状态')
}

{
  const payload = {
    data: {
      arbitrary: {
        preferred: 'https://video.example/1080.mp4?signature=keep-me',
        fallback: 'https://video.example/720.mp4',
      },
    },
  }
  assert.equal(
    bestMediaUrlInPayload(payload, pageUrl),
    'https://video.example/1080.mp4?signature=keep-me',
    'JSON 发现不得依赖站点字段名，并保留签名参数',
  )
}

{
  const html = `<html><head><meta property="og:video" content="/watch?id=42"></head><body>
    <video data-src="/media/live" type="application/vnd.apple.mpegurl"></video>
  </body></html>`
  const observations = observeMediaInHtml(html, pageUrl)
  const descriptor = buildMediaDescriptor(observations)
  assert.equal(descriptor?.type, 'hls')
  assert.equal(descriptor?.url, 'https://news.example/media/live')
}

{
  const descriptor = buildMediaDescriptor([
    { url: 'https://cdn.example/play?id=42', pageUrl, source: 'xhr', mimeType: 'video/mp4', statusCode: 206 },
    { pageUrl, source: 'mse', drmKeySystem: 'com.widevine.alpha' },
  ])
  assert.equal(descriptor?.type, 'progressive')
  assert.equal(descriptor?.drm, true)
  assert.deepEqual(descriptor?.drmKeySystems, ['com.widevine.alpha'])
}

{
  const descriptor = buildMediaDescriptor([
    { url: 'https://cdn.example/podcast.mp3', pageUrl, source: 'dom', mimeType: 'audio/mpeg', mediaKind: 'audio' },
  ])
  assert.equal(descriptor, null, '音频候选不能被误交给视频播放器')
}

console.log('media-sniffer tests passed')
