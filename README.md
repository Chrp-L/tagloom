# Tagloom

Tagloom 是一个面向图片与视频素材的本地优先桌面管理工具。它使用文件夹、分组和标签组织素材，并提供网格/列表浏览、批量选择、媒体预览与本地元数据索引。

> 当前版本：`0.1.0-alpha.2`。这是早期公开预览版本，适合体验和反馈，不建议作为唯一的素材数据备份方案。

## 主要功能

- 扫描本地图片和视频目录，不上传素材内容
- 网格与列表两种浏览方式
- 文件夹、分组和标签管理
- 显式批量选择与 Shift 连续范围选择
- 图片预览、视频封面和兼容代理播放
- 本地 SQLite 索引、缩略图缓存与数据库备份
- 中文和英文界面

## 环境要求

- Windows 10/11 x64
- Node.js 20 或更高版本
- Rust stable 工具链
- Visual Studio C++ Build Tools
- Microsoft Edge WebView2 Runtime
- PowerShell 5.1 或更高版本

## 开发环境

```powershell
git clone https://github.com/Chrp-L/tagloom.git
cd tagloom
npm ci
powershell -ExecutionPolicy Bypass -File .\scripts\setup-media-tools.ps1
npm run tauri:dev
```

`npm run tauri:dev` 使用 `Tagloom Dev` 身份和独立的数据目录，不会读取或修改安装版的数据库、缩略图、视频代理、日志与备份。开发窗口标题也会显示为 `Tagloom Dev`。正式安装版继续使用原有 `Tagloom` 数据目录。

日常开发请使用 `npm run tauri:dev`，不要用 release 模式直接启动默认 Tauri 配置。普通 debug 构建在后端也会自动使用开发数据目录，作为误用命令时的保护。

媒体工具不会提交到 Git。安装脚本会把以下依赖放入 `src-tauri/binaries`：

- FFmpeg 与 FFprobe：BtbN Windows LGPL 构建
- ExifTool 13.59：ExifTool 官方 SourceForge 发布包

重新下载依赖可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-media-tools.ps1 -Force
```

## 测试与构建

```powershell
npm test
npm run build
npm run tauri:build
```

`npm run build` 只构建前端资源。`npm run tauri:build` 会使用正式应用身份生成 Windows NSIS 安装包，并要求媒体工具已经安装。

## 数据与隐私

Tagloom 在本机应用数据目录保存 SQLite 索引、缩略图、视频代理、日志和备份。原始图片与视频不会被移动或上传；删除操作使用系统回收站。

在升级 alpha 版本前，建议先使用应用内数据库备份功能。`1.0.0` 之前的数据结构和行为仍可能调整。

## Alpha 限制

- 当前只提供 Windows x64 构建
- 第一次播放部分视频时需要等待兼容代理生成
- 大型素材库和异常格式仍需要更多真实数据验证
- 自动更新、签名安装包和稳定迁移策略尚未完成

## 第三方工具

FFmpeg、FFprobe 和 ExifTool 保持各自许可证。相关许可证文本位于 `src-tauri/binaries`。本仓库目前尚未声明项目级开源许可证。

## 反馈

请通过 GitHub Issues 提交可复现的问题，并附上系统版本、操作步骤和相关日志。提交前请移除日志中的私人文件路径。
