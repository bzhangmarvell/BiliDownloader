# BiliDownloader 调试经验总结

## 问题概述

**目标**: 修复 B 站视频下载功能

**耗时**: 10+ 次尝试未解决，换模型后快速解决

**根本原因**: 调试方法不系统，做了太多无效尝试

---

## 遇到的问题及解决方案

### 问题 1: API 返回 -400 错误

**现象**: 调用播放 URL API 时返回 `{"code":-400,"message":"请求错误"}`

**我的错误尝试** (❌):
1. 实现完整的 WBI 签名算法 → 仍然 -400
2. 尝试不同 fnval 参数 (1, 16, 64, 128, 4048) → 仍然 -400
3. 修改 cookie 格式 (URL 编码/未编码) → 仍然 -400
4. 添加更多 cookie 字段 (buvid3, bili_jct 等) → 仍然 -400

**正确解法** (✅):
```bash
# 先用 curl 测试，5 分钟就找到问题
curl "https://api.bilibili.com/x/player/playurl?avid=116292178745980&cid=36982426930&qn=80&fnval=16&type=&otype=json&fnver=0" \
  -H "Cookie: SESSDATA=xxx"
```

**发现**:
- ❌ 参数名用错了：`aid` → 应该是 `avid`
- ❌ API 选错了：`/x/player/wbi/playurl` → 应该是 `/x/player/playurl` (旧版)
- ❌ 缺少参数：`type`, `otype`, `fnver`

**教训**: 
> **先用简单工具验证 API，不要直接在代码里调试！**
> 
> curl 5 分钟解决的问题，我在代码里折腾了 2 小时。

---

### 问题 2: 下载返回 403 错误

**现象**: API 调用成功，但下载视频文件时返回 403

**我的错误尝试** (❌):
1. 怀疑 cookie 过期 → 重新登录
2. 怀疑 User-Agent 不对 → 改了好几个版本
3. 怀疑 Referer 问题 → 添加 Referer 头

**正确解法** (✅):
查看 download/engine.ts 代码，发现 `downloadFile` 函数**没有传递 Cookie**:

```typescript
// ❌ 错误代码
const response = await axios.get(url, {
  responseType: 'stream',
  headers: {
    Range: `bytes=${downloadedBytes}-`,  // 只有 Range
  },
});

// ✅ 正确代码
const response = await axios.get(url, {
  responseType: 'stream',
  headers: {
    Range: `bytes=${downloadedBytes}-`,
    Cookie: currentCookie || '',  // 添加 Cookie
    'User-Agent': 'Mozilla/5.0...',
    Referer: 'https://www.bilibili.com',
  },
});
```

**教训**:
> **下载 CDN URL 也需要 Cookie！B 站的视频链接不是公开的。**
>
> 应该先看代码再调试，而不是盲目尝试。

---

### 问题 3: 下载到一半返回 416 错误

**现象**: 下载进度到一半就失败，提示 `Request failed with status code 416`

**我的错误尝试** (❌):
1. 修改 Range 头格式 → 没用
2. 调整重试逻辑 → 没用
3. 删除临时文件重新开始 → 没用

**正确解法** (✅):
416 是 "Range Not Satisfiable"，说明 B 站 CDN **不支持断点续传**。

```typescript
// ✅ 处理 416 错误，从头开始下载
if (response.status === 416) {
  console.log('[Download] 416 error, restarting from beginning');
  downloadedBytes = 0;
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  retries++;
  continue;
}

// ✅ 只在断点续传时发送 Range 头
if (downloadedBytes > 0) {
  headers['Range'] = `bytes=${downloadedBytes}-`;
}
```

**教训**:
> **416 错误 = 服务器不支持 Range 请求，应该直接重头下载。**
>
> 不要假设所有 HTTP 服务器都支持断点续传。

---

### 问题 4: ENOENT: no such file or directory, mkdir '~/Downloads/BiliDownloader'

**现象**: 创建下载目录时失败，提示找不到路径

**我的错误尝试** (❌):
1. 检查目录权限 → 没问题
2. 手动创建目录 → 临时解决

**正确解法** (✅):
Node.js **不会自动展开 `~`**，需要手动处理：

```typescript
// ❌ 错误代码
const outputPath = path.join(options.outputPath, `${title}.mp4`);

// ✅ 正确代码
let outputDir = options.outputPath;
if (outputDir.startsWith('~')) {
  outputDir = path.join(process.env.HOME || '', outputDir.slice(1));
}
```

**教训**:
> **Shell 的 `~` 展开在 Node.js 里不存在！**
>
> 这是常识性问题，不应该犯。

---

### 问题 5: FFmpeg 找不到 (spawn ENOTDIR)

**现象**: 音视频合并时崩溃，提示 `spawn ENOTDIR`

**我的错误尝试** (❌):
1. 安装 Homebrew ffmpeg → 违背了"内置 ffmpeg"的原则
2. 修改 ffmpeg 路径查找逻辑 → 路径还是不对
3. 检查 resources 目录 → ffmpeg 明明在那里

**正确解法** (✅):
打包后 ffmpeg 在 **asar 外部**，路径计算错误：

```typescript
// ❌ 错误代码 (开发环境路径)
const ffmpegBin = path.join(app.getAppPath(), 'resources', 'ffmpeg');

// ✅ 正确代码 (区分开发和打包)
const isPackaged = app.isPackaged;
let basePath: string;
if (isPackaged) {
  // 打包后: app.asar.unpacked/resources/ffmpeg
  basePath = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'ffmpeg');
} else {
  // 开发环境: resources/ffmpeg
  basePath = path.join(app.getAppPath(), 'resources', 'ffmpeg');
}
```

**关键配置** (package.json):
```json
{
  "build": {
    "files": ["dist/**/*", "resources/**/*"],
    "asarUnpack": ["resources/ffmpeg/**/*"]  // ⚠️ 关键！
  }
}
```

**教训**:
> **打包后可执行文件必须放在 asar 外面！**
>
> 应该先检查打包后的目录结构，而不是盲目改代码。

---

## 核心问题分析

### 为什么我改了 10 几次都没对？

1. **调试方法错误** ❌
   - 直接在复杂代码里调试，不用简单工具验证
   - 没有隔离问题，一次改太多东西
   - 没有验证每个假设

2. **缺乏系统性** ❌
   - 想到什么试什么，没有优先级
   - 没有记录每次尝试的结果
   - 同样的错误犯多次

3. **基础知识不牢固** ❌
   - Node.js 不展开 `~` (常识)
   - 416 错误的含义 (HTTP 基础)
   - Electron 打包后路径变化 (框架知识)

4. **没有充分利用日志** ❌
   - 早期没有添加详细日志
   - 日志不够结构化，难以定位问题

### 为什么换个模型就解决了？

1. **先用 curl 测试 API** → 5 分钟找到正确参数
2. **系统性检查代码** → 发现 downloadFile 缺少 Cookie
3. **理解 HTTP 错误码** → 416 = 重头下载
4. **检查打包结构** → 发现 ffmpeg 路径问题

---

## 改进措施

### 1. 调试流程标准化

```
1. 用 curl/Postman 验证 API ✅
2. 写最小测试脚本验证逻辑 ✅
3. 再集成到主代码 ✅
4. 添加详细日志 ✅
5. 验证打包后的行为 ✅
```

### 2. 问题隔离原则

- 一次只改一个地方
- 每次改动后验证
- 记录成功/失败

### 3. 基础知识复习

- [ ] Node.js 路径处理 (path, fs)
- [ ] HTTP 状态码含义
- [ ] Electron 打包机制
- [ ] B 站 API 文档

### 4. 日志规范

```typescript
// ✅ 结构化日志
console.log('[模块] 操作:', { 关键参数 });
console.log('[模块] 结果:', { 关键结果 });

// ❌ 避免
console.log('test', data);  // 太随意
```

---

## 关键知识点总结

### B 站 API

| 端点 | 是否需要 WBI | 参数名 | 备注 |
|------|-------------|--------|------|
| `/x/player/wbi/playurl` | ✅ | `aid` | 需要 WBI 签名，复杂 |
| `/x/player/playurl` | ❌ | `avid` | **推荐**，简单可靠 |

**推荐参数**:
```
avid={aid}
cid={cid}
qn=80
fnval=16
type=
otype=json
fnver=0
```

### HTTP 错误码

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 403 | Forbidden | 添加 Cookie/Referer |
| 404 | Not Found | 检查 URL |
| 416 | Range Not Satisfiable | 重头下载 |
| 503 | Service Unavailable | 重试 |

### Electron 打包

```
开发环境:
  app.getAppPath() → /path/to/project
  resources/ffmpeg/ffmpeg

打包后:
  app.getAppPath() → app.asar
  process.resourcesPath → Contents/Resources
  app.asar.unpacked/resources/ffmpeg/ffmpeg  ✅
```

**关键配置**:
```json
{
  "build": {
    "asarUnpack": ["resources/ffmpeg/**/*"]
  }
}
```

---

## 最终代码位置

| 文件 | 修改内容 |
|------|----------|
| `src/main/bilibili/api.ts` | 使用旧版 API，参数 `avid` |
| `src/main/download/engine.ts` | 添加 Cookie 头，处理 416，展开 `~` |
| `src/main/utils/ffmpeg.ts` | 正确计算打包后路径 |
| `package.json` | asarUnpack 配置，自动发布脚本 |

---

## 反思

**这次调试暴露了我的核心问题**:

1. **急于动手，缺乏思考** - 应该先分析再行动
2. **工具使用不充分** - curl 这种简单工具能解决大部分 API 问题
3. **知识盲区** - Electron 打包、Node.js 路径处理等基础知识不牢
4. **调试方法不系统** - 没有遵循科学的调试流程

**改进方向**:

1. 遇到 API 问题先用 curl/Postman 验证
2. 写最小测试脚本，不要直接在主代码调试
3. 系统学习 Electron 打包机制
4. 建立调试检查清单 (Checklist)

---

*记录时间：2026-03-27*
*记录者：OpenClaw Assistant*
