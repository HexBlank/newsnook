import assert from 'node:assert/strict'

import { parseMediaApiBody } from '../src/features/mediaSniffer/apiParser'
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
import { logicalMediaUrl } from '../src/features/mediaSniffer/classifier'
import {
  admitObservation,
  buildMediaGraph,
  descriptorFromAsset,
  selectPlayableAsset,
  synthesizeDashMpd,
} from '../src/features/mediaSniffer/graph'
import { originOf, playbackHeadersForTarget } from '../src/features/mediaSniffer/originHeaders'
import { observationsWithoutSessionNonce } from '../src/features/mediaSniffer/native'
import type { MediaObservation } from '../src/features/mediaSniffer/types'
import { shouldBridgeNativePlayback } from '../src/features/mediaSniffer/playback'
import {
  discoverMediaDescriptor,
  embeddedPageUrlsInHtml,
  mediaDescriptorHtml,
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
  const m4sVideo = 'https://upos.example/video.m4s?cdnid=1'
  const m4sAudio = 'https://upos.example/audio.m4s'
  assert.equal(
    mediaFormatFor(m4sVideo, 'video/mp4'),
    'video-track',
    '.m4s 有 video MIME 时是完整 Representation，不是垃圾分片',
  )
  assert.equal(mediaFormatFor(m4sAudio, 'audio/mp4'), 'audio-track')
  assert.equal(
    mediaFormatFor(m4sVideo),
    'video-track',
    '无 MIME 的 .m4s 不得仅因扩展名变成 segment',
  )
  assert.equal(
    logicalMediaUrl('https://cdn.example/videoplayback?id=42&mime=video%2Fmp4&range=0-524287'),
    'https://cdn.example/videoplayback?id=42&mime=video%2Fmp4',
  )
}

{
  // Fixture 06 (HLS 三域名头隔离) and 09/10 (Cookie/Bearer same vs cross origin):
  // covered by playbackHeadersForTarget — Cookie/Authorization stay on exact origin;
  // captured Range is never copied into playback headers.
  const pageUrl = 'https://news.example/articles/42'
  const videoOrigin = 'https://v1.cdn.example'
  const captured = {
    'https://news.example': {
      cookie: 'sid=1',
      authorization: 'Bearer secret',
      referer: pageUrl,
      'user-agent': 'NewsNook',
    },
    [videoOrigin]: { referer: pageUrl, 'user-agent': 'NewsNook' },
  }
  const same = playbackHeadersForTarget({
    targetUrl: 'https://news.example/play.m3u8',
    pageUrl,
    capturedByOrigin: captured,
  })
  assert.equal(same.cookie, 'sid=1')
  assert.equal(same.authorization, 'Bearer secret')
  const cross = playbackHeadersForTarget({
    targetUrl: `${videoOrigin}/seg.ts`,
    pageUrl,
    capturedByOrigin: captured,
  })
  assert.equal(cross.cookie, undefined)
  assert.equal(cross.authorization, undefined)
  assert.equal(cross.referer, 'https://news.example/')
  assert.equal(originOf('https://v1.cdn.example:443/a'), 'https://v1.cdn.example')
  const ranged = playbackHeadersForTarget({
    targetUrl: 'https://news.example/play.m3u8',
    pageUrl,
    capturedByOrigin: {
      'https://news.example': { range: 'bytes=0-1', authorization: 'Bearer secret', 'user-agent': 'NewsNook' },
    },
  })
  assert.equal(ranged.range, undefined, '播放头不得复制网页捕获的 Range')
  const html = mediaDescriptorHtml(
    {
      type: 'progressive',
      url: 'https://cdn.example/v.mp4',
      pageUrl,
      score: 1,
      videoTracks: [],
      audioTracks: [],
      subtitles: [],
      drm: false,
      drmKeySystems: [],
      requestHeaders: {
        Referer: pageUrl,
        cookie: 'sid=1',
        Authorization: 'Bearer secret',
      },
    },
    { title: 'clip' },
  )
  assert.equal(html.includes('sid=1'), false, 'data-media-headers 不得序列化 Cookie')
  assert.equal(html.includes('Bearer'), false, 'data-media-headers 不得序列化 Authorization')
  assert.equal(html.includes('Referer'), true)
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

{
  const assets = buildMediaGraph([
    {
      url: 'https://cdn.example/play?id=42',
      pageUrl,
      source: 'network',
      mimeType: 'video/mp4',
    },
  ])
  assert.equal(assets.length, 1)
  const descriptor = buildMediaDescriptor([
    { url: 'https://cdn.example/play?id=42', pageUrl, source: 'network', mimeType: 'video/mp4' },
  ])
  assert.equal(descriptor?.type, 'progressive')
  assert.equal(descriptor?.url, 'https://cdn.example/play?id=42')
}

{
  const body = JSON.stringify({ playurl: 'https://cdn.example/live/master.m3u8?token=1' })
  const parsed = parseMediaApiBody(body, pageUrl, 'fetch')
  const descriptor = buildMediaDescriptor(parsed)
  assert.equal(descriptor?.type, 'hls')
  assert.equal(descriptor?.url, 'https://cdn.example/live/master.m3u8?token=1')
}

{
  const body = JSON.stringify({
    dash: {
      video: [{
        baseUrl: 'https://upos.example/video.m4s',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        bandwidth: 4500000,
        codecs: 'avc1.640028',
      }],
      audio: [{
        baseUrl: 'https://upos.example/audio.m4s',
        mimeType: 'audio/mp4',
        bandwidth: 128000,
        codecs: 'mp4a.40.2',
      }],
    },
  })
  const parsed = parseMediaApiBody(body, pageUrl, 'xhr')
  const assets = buildMediaGraph(parsed)
  assert.equal(assets.length, 1, 'B站式 dash.video+audio 必须同一 asset')
  assert.equal(assets[0].videos.length, 1)
  assert.equal(assets[0].audios.length, 1)
  const xml = synthesizeDashMpd(assets[0].videos[0], assets[0].audios[0])
  assert.match(xml, /video\.m4s/)
  assert.match(xml, /audio\.m4s/)
  const descriptor = descriptorFromAsset(assets[0], () => 'blob:nn-mpd')
  assert.equal(descriptor?.type, 'dash')
  assert.equal(descriptor?.url, 'blob:nn-mpd')
}

{
  const observation: MediaObservation = {
    url: 'https://upos.example/video.m4s',
    pageUrl,
    source: 'network',
    mimeType: 'video/mp4',
  }
  const assets = buildMediaGraph([observation])
  assert.equal(selectPlayableAsset(assets), null, '未配对 video-track 不能进入可播集合')
  const descriptor = buildMediaDescriptor([observation])
  assert.equal(
    descriptor,
    null,
    '单条 .m4s + video/mp4 不得产出可播的非 DRM descriptor',
  )
}

{
  const assets = buildMediaGraph([
    { url: 'https://cdn.example/ad.mp4', pageUrl, source: 'network', mimeType: 'video/mp4', width: 640, height: 360 },
    { url: 'https://cdn.example/master.m3u8', pageUrl, source: 'network' },
  ])
  assert.equal(assets.length, 2)
  assert.equal(selectPlayableAsset(assets)?.manifest?.url, 'https://cdn.example/master.m3u8')
}

{
  const assets = buildMediaGraph([
    { url: 'https://cdn.example/a.mp4', pageUrl, source: 'dom', mimeType: 'video/mp4' },
    { url: 'https://cdn.example/b.mp4', pageUrl, source: 'dom', mimeType: 'video/mp4' },
  ])
  assert.equal(assets.length, 2)
}

{
  const network = new Set(['https://cdn.example/real.mp4'])
  assert.equal(
    admitObservation(
      { url: 'https://evil.example/ad.mp4', pageUrl, source: 'dom', sessionNonce: 'abc' },
      'abc',
      network,
    ),
    false,
  )
  assert.equal(
    admitObservation(
      { url: 'https://cdn.example/real.mp4', pageUrl, source: 'dom', sessionNonce: 'nope' },
      'abc',
      network,
    ),
    false,
  )
  assert.equal(
    admitObservation(
      { url: 'https://cdn.example/real.mp4', pageUrl, source: 'network' },
      'abc',
      network,
    ),
    true,
  )
}

{
  const leftover: MediaObservation = {
    url: 'https://cdn.example/master.m3u8',
    pageUrl,
    source: 'fetch',
    sessionNonce: 'native-session',
  }
  assert.equal(
    buildMediaGraph([leftover]).length,
    0,
    'Graph 不得吞带 leftover sessionNonce 的探针观察',
  )
  const stripped = observationsWithoutSessionNonce([leftover])
  assert.equal('sessionNonce' in stripped[0], false)
  assert.equal(
    selectPlayableAsset(buildMediaGraph(stripped))?.manifest?.url,
    'https://cdn.example/master.m3u8',
    'native 剥掉 nonce 后 Graph 应摄入 fetch 清单',
  )
  const jsonBody = observationsWithoutSessionNonce([{
    url: 'https://api.example/playurl',
    pageUrl,
    source: 'fetch',
    bodyText: '{"url":"https://cdn.example/from-json.m3u8"}',
    sessionNonce: 'native-session',
  }])
  assert.equal(
    selectPlayableAsset(buildMediaGraph(jsonBody))?.manifest?.url,
    'https://cdn.example/from-json.m3u8',
    '剥掉 nonce 的 fetch JSON bodyText 应展开为 HLS',
  )
}

{
  const base = 'https://cdn.example/videoplayback?id=42&mime=video%2Fmp4'
  const descriptor = buildMediaDescriptor([
    { url: `${base}&range=0-1000`, pageUrl, source: 'network', mimeType: 'video/mp4' },
    { url: `${base}&range=1001-2000`, pageUrl, source: 'network', mimeType: 'video/mp4' },
  ])
  assert.equal(descriptor?.url, base)
  assert.equal(descriptor?.type, 'progressive')
}

{
  const calls: string[] = []
  const html = '<video src="https://cdn.example/preview.mp4"></video><iframe src="https://player.example/ad"></iframe><iframe src="https://player.example/real"></iframe>'
  await discoverMediaDescriptor({
    pageUrl,
    html,
    runtime: true,
    timeoutMs: 6000,
    observeNative: async (url) => {
      calls.push(url)
      if (url.includes('/ad')) {
        return [{ url: 'https://cdn.example/ad.mp4', pageUrl: url, source: 'network', mimeType: 'video/mp4' }]
      }
      if (url.includes('/real')) {
        return [{ url: 'https://cdn.example/master.m3u8', pageUrl: url, source: 'network' }]
      }
      return [{ url: 'https://cdn.example/preview.mp4', pageUrl: url, source: 'network', mimeType: 'video/mp4' }]
    },
  })
  assert.ok(calls.some((item) => item.includes('/ad')))
  assert.ok(calls.some((item) => item.includes('/real')))
  assert.ok(calls.some((item) => item === pageUrl || item.includes('articles/42')))
}

console.log('media-sniffer tests passed')
