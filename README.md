# Aim Position Trainer

一个专注定位能力训练的射击练习客户端 MVP。第一版包含单目标随机刷新、鼠标锁定、命中判定、实时统计、训练结果和本地历史记录。

## 功能

- 定位靶场：每次只刷新一个目标，命中后立即生成下一个目标。
- 可调参数：训练时长、目标大小、目标生成范围、鼠标灵敏度、准星大小、颜色和命中音效。
- 实时统计：命中数、射击数、命中率、平均定位时间、当前分数、历史最佳。
- 结果记录：每局结束后保存最近 20 次成绩到本地浏览器存储。

## 启动

首次安装依赖：

```powershell
npm.cmd install --cache .\.npm-cache --no-audit --no-fund
```

浏览器开发模式：

```powershell
npm.cmd run dev
```

桌面客户端开发模式：

```powershell
npm.cmd run dev:desktop
```

生产构建：

```powershell
npm.cmd run build
npm.cmd start
```

## 操作

- 点击“开始训练”进入一局训练。
- 如果鼠标未锁定，点击训练区域即可锁定。
- 左键射击，准星对准目标时命中。
- 训练过程中可以点击“结束训练”提前结束。
