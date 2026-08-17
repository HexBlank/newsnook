
# 一、总体架构

不要把嗅探器设计成：

```text
URL 包含 .mp4 / .m3u8
        ↓
      播放
```

最佳实践应该是：

```text
                   ┌──────────────┐
                   │ Browser Engine│
                   │  WebView/Web  │
                   └───────┬──────┘
                           │
                    页面正常运行
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     网络请求观察      Media DOM/MSE      DRM信号
          │              运行时观察           │
          └────────────────┼────────────────┘
                           ▼
                    Candidate Collector
                           │
                           ▼
                     媒体资源识别
                           │
                           ▼
                     Manifest解析
                           │
                           ▼
                      Media Graph
                           │
                   ┌───────┴────────┐
                   ▼                ▼
                非DRM              DRM
                   │                │
              播放器直接播       正常DRM链路
                   │                │
                   └───────┬────────┘
                           ▼
                        Player
```

核心不是“抓 URL”，而是建立一个完整的 **Media Resource Graph**。

---

# 二、第一层：网络请求观察

这是主嗅探通道。

浏览器页面运行时，对所有资源请求建立观察器。

每条请求至少记录：

```text
RequestRecord
{
    url
    method
    requestHeaders
    responseHeaders
    mimeType
    statusCode
    initiator
    resourceType
    timestamp
    pageUrl
}
```

重点观察：

```text
video/*
audio/*

application/vnd.apple.mpegurl
application/x-mpegURL

application/dash+xml

video/mp4
audio/mp4
video/webm
audio/webm

.m3u8
.mpd
.mp4
.m4s
.ts
.webm
.m4a
.aac
```

但**扩展名只能作为一个信号，不能作为最终依据**。

因为可能出现：

```text
https://cdn.example.com/play?id=123
```

实际上 Response：

```text
Content-Type: video/mp4
```

或者：

```text
https://example.com/api/stream?token=xxxx
```

实际上返回：

```text
#EXTM3U
...
```

因此判断优先级应该是：

```text
响应内容类型
       +
URL特征
       +
响应内容特征
       +
请求行为特征
       ↓
   Media Candidate
```

Android WebView 这类环境确实可以通过宿主回调观察大量资源请求，不过官方也明确指出，`blob:` 请求本身不会进入 `shouldInterceptRequest()`，重定向也存在一些回调限制，所以生产级实现不能只依赖这一层。([Android Developers][2])

---

# 三、第二层：网页媒体运行时观察

网络嗅探必须搭配网页运行时观察。

监听：

```text
<video>
<audio>
<source>
```

重点观察这些变化：

```text
video.src
video.currentSrc

source.src

srcObject

load()
play()
```

例如页面最开始：

```html
<video></video>
```

几秒后 JS 才执行：

```text
video.src = xxx
```

嗅探器应该立刻收到：

```text
MEDIA_ELEMENT_SOURCE_CHANGED
```

然后把 URL 加入候选池。

---

# 四、第三层：专门处理 Blob / MSE

这是现代视频网站非常重要的一层。

你经常会看到：

```text
<video src="blob:https://example.com/2d4....">
```

这个 `blob:` 地址本身**不是视频 CDN 地址**。

真实情况通常是：

```text
网络
 │
 ├─ video_xxx.m4s
 ├─ video_xxx.m4s
 ├─ audio_xxx.m4s
 └─ audio_xxx.m4s
        ↓
   JavaScript
        ↓
    MediaSource
        ↓
   SourceBuffer
        ↓
   blob:xxxx
        ↓
    <video>
```

MSE 就是为了让 JavaScript 动态向媒体缓冲区追加音视频数据而设计的。([W3C][3])

因此：

```text
看到 blob:
```

绝对不能：

```text
把 blob URL 交给播放器
```

而应该：

```text
发现 blob:
      ↓
标记页面正在使用 MSE
      ↓
关联该页面最近发生的媒体网络请求
      ↓
识别 Manifest / 音视频 Adaptation Set
      ↓
恢复逻辑媒体资源
```

同时观察：

```text
MediaSource

addSourceBuffer(
    'video/mp4; codecs="..."'
)

addSourceBuffer(
    'audio/mp4; codecs="..."'
)
```

这里非常有价值，因为它会直接告诉你：

```text
这是 video
这是 audio
codec 是什么
```

不必通过 URL 猜。

---

# 五、不要把媒体分片当成多个“视频”

这是很多初级嗅探器的问题。

例如网页请求：

```text
master.mpd

video-init.m4s
video-001.m4s
video-002.m4s
video-003.m4s

audio-init.m4s
audio-001.m4s
audio-002.m4s
audio-003.m4s
```

错误实现会提示：

> 检测到 9 个视频。

正确实现应该最终只显示：

```text
发现 1 个媒体

视频：
1080P
AVC
5 Mbps

音频：
AAC
128 kbps
```

所以需要一个：

# Media Graph

例如：

```text
MediaAsset
│
├── Manifest
│     └── master.mpd
│
├── Video AdaptationSet
│     │
│     ├── 360p
│     ├── 720p
│     ├── 1080p
│     └── 2160p
│
├── Audio AdaptationSet
│     │
│     ├── AAC 64K
│     └── AAC 192K
│
└── Subtitle
      ├── zh
      └── en
```

**用户看到的是 MediaAsset，不是网络请求列表。**

---

# 六、Manifest 优先

一旦检测到：

```text
.m3u8
```

或者：

```text
.mpd
```

优先级应该立刻高于：

```text
.ts
.m4s
```

也就是说：

```text
master.m3u8     ← 高价值
index.m3u8      ← 高价值
master.mpd      ← 高价值

segment001.ts   ← 低价值
segment002.ts   ← 低价值

chunk001.m4s    ← 低价值
chunk002.m4s    ← 低价值
```

因为 Manifest 描述的是**完整媒体结构**。

---

# 七、HLS 嗅探逻辑

发现 HLS：

```text
master.m3u8
```

解析：

```text
#EXT-X-STREAM-INF:
BANDWIDTH=
RESOLUTION=
CODECS=
AUDIO=
SUBTITLES=
```

生成：

```text
HLS Asset
│
├── 360P
├── 720P
├── 1080P
└── 4K
```

如果存在独立音频：

```text
#EXT-X-MEDIA:TYPE=AUDIO
```

则建立：

```text
Video Variant
       │
       └──── Audio Group
```

不要自己把 segment 拼起来再播。

播放器应该直接吃：

```text
Master Playlist
```

然后让自适应流媒体模块自己处理。

---

# 八、DASH 嗅探逻辑

发现：

```text
manifest.mpd
```

解析：

```text
Period

AdaptationSet
    contentType=video

Representation
    width
    height
    bandwidth
    codecs

AdaptationSet
    contentType=audio

Representation
```

最终得到：

```text
                 DASH Asset
                     │
          ┌──────────┴──────────┐
          │                     │
        VIDEO                  AUDIO
          │                     │
      ┌───┼────┐            ┌───┼───┐
     720 1080 4K            AAC EAC3 ...
```

播放时：

```text
Video Representation
           +
Audio Representation
           ↓
          Player
```

而不是期望某个 1080P URL 同时有声音。

---

# 九、请求上下文必须跟媒体一起保存

真正可以播放的资源不是：

```text
String url
```

而应该是：

```text
PlayableResource
{
    url

    requestContext {
        headers
        cookieSession
        referer
        origin
        userAgent
    }

    format

    sourcePage

    expiry

    drmInfo
}
```

尤其是：

```text
Referer
Cookie
Authorization
Origin
User-Agent
```

有些 CDN 是：

```text
URL 正确
+
Cookie 不正确
=
403
```

因此最好的做法不是：

> 嗅探完 URL，然后重新构造一个完全独立的 HTTP 请求。

而是：

> **让播放器使用和浏览器同一个授权会话，或者使用与当前会话绑定的数据源。**

这样不会丢掉认证状态。

---

# 十、不要破坏签名 URL

例如抓到：

```text
https://cdn.example.com/video.m3u8
    ?expire=1780000000
    &token=...
    &signature=...
```

原 URL 必须完整保存。

不要为了“去重”把：

```text
?token=
&signature=
&expire=
```

删掉以后再播放。

正确做法是保存两个值：

```text
originalUrl
```

用于实际播放。

另生成：

```text
resourceFingerprint
```

只用于内部去重。

即：

```text
Original URL
    ↓
绝不修改
    ↓
播放器


Original URL
    ↓
Normalize
    ↓
Fingerprint
    ↓
去重
```

---

# 十一、候选资源评分，而不是简单 true/false

可以采用：

```text
Candidate Score
```

例如：

```text
发现 DASH MPD                    +100

发现 HLS Master                  +100

Content-Type = video/*           +70

Content-Type = audio/*           +60

URL 包含 .mp4                    +50

URL 包含 .m3u8                   +80

URL 包含 .m4s                    +20

URL 包含 .ts                     +10

Range Request                    +10

被 MediaSource 使用             +80

被 <video> currentSrc 使用       +100
```

最后：

```text
score > threshold
```

才进入媒体列表。

这样误报会少非常多。

---

# 十二、资源去重逻辑

同一个视频可能出现：

```text
https://cdn/a.m3u8?token=111
https://cdn/a.m3u8?token=222

https://cdn/video/seg1.ts
https://cdn/video/seg2.ts
https://cdn/video/seg3.ts
```

不要显示成 5 个资源。

应该按：

```text
页面上下文
+
Manifest
+
媒体轨
+
时间关联
+
URL结构
```

归并成：

```text
MediaAsset #1
```

理想结果始终应该接近：

```text
这个网页上有几个“节目/媒体”

而不是：

这个网页发出了多少媒体 HTTP 请求
```

---

# 十三、嗅探后先做轻量验证

进入“可播放资源”之前做一次验证。

例如：

```text
Candidate
   ↓
轻量网络验证
   ↓
检查状态
   ↓
检查Content-Type
   ↓
必要时读少量前导字节
```

判断：

```text
200 / 206
```

以及实际数据类型。

对于支持 Range 的媒体，可以只读取很小一部分数据，而不是把整个文件下载下来。

结果：

```text
VALID
INVALID
EXPIRED
UNAUTHORIZED
DRM
```

这样 UI 不会把一堆已经失效的临时 URL 显示成“可播放”。

---

# 十四、播放模块只接受“已经规范化的媒体描述”

不要：

```text
嗅探器发现 URL
        ↓
player.play(url)
```

建议：

```text
MediaDescriptor
{
    type:
        progressive
        hls
        dash

    manifest

    videoTracks[]

    audioTracks[]

    subtitles[]

    sessionContext

    drm
}
```

然后：

```text
MediaDescriptor
       ↓
Playback Engine
```

---

# 十五、播放策略

### Progressive MP4

```text
URL
 ↓
带当前Session请求
 ↓
播放器
```

### HLS

```text
Master m3u8
 ↓
播放器解析 Variant
 ↓
选择画质
 ↓
加载 Media Playlist
 ↓
Segment
```

### DASH

```text
MPD
 ↓
播放器解析
 ↓
选择 Video Representation
          +
选择 Audio Representation
 ↓
同步播放
```

### MSE

如果能够恢复：

```text
MPD / HLS / 原始流
```

优先交给原生播放器。

如果只能得到：

```text
浏览器内部生成的数据流
```

而无法恢复稳定媒体描述，则不要假装存在一个“可复制的真实 URL”。

---

# 十六、DRM 要作为独立状态处理

嗅探阶段检测：

```text
MPD ContentProtection

PSSH

encrypted event

MediaKeys / KeySystem
```

一旦判断为 DRM：

```text
MediaAsset
{
    drm = true
}
```

之后不要继续把它当普通 MP4/M3U8。

W3C EME 的模型本身就是：

```text
Encrypted Media
      ↓
HTMLMediaElement
      ↓
EME
      ↓
Key System / CDM
      ↓
License Exchange
      ↓
Playback
```

CDM 才负责受保护内容的解密，而且认证/授权依然由内容服务控制。([W3C][1])

因此播放逻辑是：

```text
检测到 DRM
     ↓
当前播放器是否支持对应 KeySystem？
     │
   否 ──→ 不可播放
     │
    是
     ↓
当前会话正常请求 License
     ↓
License Server
     │
授权失败 ──→ 不可播放
     │
授权成功
     ↓
CDM
     ↓
播放
```

**不要把 DRM 媒体进入普通直链播放通道。**

---

# 十七、会员画质就在这里处理

比如 Manifest：

```text
360P
720P
1080P
4K
```

不要简单认为：

```text
解析到了 4K
=
可以播放 4K
```

正确状态应该是：

```text
Representation
{
    resolution: 3840x2160

    advertised: true
    authorized: ?
    playable: ?
}
```

然后实际验证。

最终可能是：

```text
360P   ✓
720P   ✓
1080P  ✓
4K     × entitlement
```

也可能游客得到的 Manifest 从开始就是：

```text
360P
720P
```

根本不存在 1080P / 4K。

还可能是：

```text
4K Manifest     ✓
4K Segment      ✓
DRM License     ×
```

最终仍然不能播放。

因此：

> **资源发现和播放授权必须是两个状态。**

---

# 十八、临时 URL 过期处理

大型视频网站的资源地址经常有有效期。

播放过程中：

```text
403
401
URL expired
```

最佳实践不是试图自行生成新的签名。

而是：

```text
播放器发现授权地址失效
        ↓
重新激活原网页会话
        ↓
网页正常重新获取播放信息
        ↓
重新嗅探
        ↓
建立新的 MediaDescriptor
        ↓
从原时间点继续播放
```

即：

```text
重新嗅探
而不是
逆向签名
```

这种方案维护成本最低，也最适合不同视频网站。

---

# 十九、最终推荐的嗅探状态机

整个逻辑可以浓缩为：

```text
PAGE_OPEN
   │
   ▼
OBSERVE
网络 + DOM + MSE + DRM
   │
   ▼
COLLECT
收集候选请求
   │
   ▼
CLASSIFY
MP4 / HLS / DASH / AUDIO / MSE / DRM
   │
   ▼
GROUP
分片 → Representation
Representation → MediaAsset
   │
   ▼
PARSE
Manifest
   │
   ▼
BUILD_MEDIA_GRAPH
   │
   ▼
VALIDATE
当前 Session 是否可访问
   │
   ├──── unauthorized ──→ 标记不可播
   │
   ▼
PLAYABLE
   │
   ▼
HANDOFF
URL/Manifest + Session Context
   │
   ▼
PLAYER
   │
   ├── Progressive
   ├── HLS
   ├── DASH
   └── DRM/CDM
   │
   ▼
PLAY
```

其中最重要的设计原则就是这一句：

> **嗅探器应该让网站在合法会话里自己完成鉴权和播放地址生成，然后观察最终媒体拓扑，把当前会话已经有权访问的资源交给正确的播放器。**

对于 MSE，浏览器本身可以通过 `MediaSource` 和多个 `SourceBuffer` 动态构造音视频流，所以“找到一个视频 URL”已经不是现代嗅探器的正确抽象；应该恢复的是**媒体清单、轨道关系和播放会话**。([W3C][3])

对于 DRM，则明确停在正常的 EME/CDM/License 播放链路，不把“拿到媒体 URL”误认为“拿到了播放权限”。([W3C][4])
