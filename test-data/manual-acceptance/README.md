# Tagloom 人工验收素材

运行以下命令可重新生成全部素材：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-manual-test-data.ps1
```

目录应包含 12 张图片和 4 段短视频。素材由本地 FFmpeg 合成，不包含个人数据或外部版权内容。

`16-large-proxy-fallback.mp4` 是一段 2560×1440 的 MPEG-4 视频，用于检查固定控制条和兼容代理回退。

建议在 Tagloom 中创建标签“精选”和“待处理”，创建分组“人工验收”，并给任意图片添加备注“这是一张测试图片”。测试重命名、移动和回收站删除时仅操作此目录中的素材。
